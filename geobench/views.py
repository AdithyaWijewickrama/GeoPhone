import base64
import json
import re
from datetime import date, datetime, time as datetime_time, timedelta
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .ml_model import process_geophone_csv, generate_event_plot, generate_event_plot_from_data, process_geophone_chunk
from .ml_features import extract_event_features, FEATURE_VERSION
from .ml_classifier import suggest_label, METADATA_PATH
from .models import Location, FileBatch, AnomalyLabel, KnownEvent, EventLabel, UserProfile, EventFeatures, ClassifierRun


def serialize_user(user):
    """Builds the user object returned to the frontend, including profile, display-name, and Google account details where available."""
    if not user:
        return None
    avatar_url = None
    google_id = None
    if hasattr(user, 'profile'):
        avatar_url = user.profile.avatar_url
        google_id = user.profile.google_id

    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    display_name = full_name if full_name else (user.first_name or user.username)
    return {
        'id': user.id,
        'username': user.username,
        'name': full_name or user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'display_name': display_name,
        'avatar_url': avatar_url,
        'google_id': google_id,
        'is_google': bool(google_id),
    }


def decode_jwt_payload(token_str):
    """Decodes the payload portion of a JWT for reading claims; it does not validate the token signature."""
    try:
        parts = token_str.split('.')
        if len(parts) >= 2:
            payload_b64 = parts[1]
            rem = len(payload_b64) % 4
            if rem > 0:
                payload_b64 += '=' * (4 - rem)
            payload_json = base64.urlsafe_b64decode(payload_b64.encode('utf-8')).decode('utf-8')
            return json.loads(payload_json)
    except Exception as e:
        print("ERROR(decode_jwt_payload): ",e)
        pass
    return None


def get_request_user(request, data=None):
    """Resolves the current Django session user or a user identified by request data/token information."""
    if request.user and request.user.is_authenticated:
        return request.user

    user_id = None
    if isinstance(data, dict):
        user_id = data.get('user_id')
    if not user_id:
        user_id = request.headers.get('X-User-Id')
    if not user_id:
        user_id = request.GET.get('user_id') or request.POST.get('user_id')

    if user_id:
        try:
            return User.objects.filter(id=int(user_id)).first()
        except (ValueError, TypeError):
            pass
    return None


@csrf_exempt
def auth_signup(request):
    """Handles account registration, validates input, creates the Django user, and returns an authentication response."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = json.loads(request.body)
        username = (data.get('username') or '').strip()
        email = (data.get('email') or '').strip()
        password = data.get('password') or ''
        first_name = (data.get('first_name') or '').strip()
        last_name = (data.get('last_name') or '').strip()

        if not username:
            return JsonResponse({'error': 'Username is required'}, status=400)
        if len(username) < 3:
            return JsonResponse({'error': 'Username must be at least 3 characters long'}, status=400)
        if not password:
            return JsonResponse({'error': 'Password is required'}, status=400)
        if len(password) < 6:
            return JsonResponse({'error': 'Password must be at least 6 characters long'}, status=400)

        if User.objects.filter(username__iexact=username).exists():
            return JsonResponse({'error': 'Username is already taken'}, status=400)

        if email and User.objects.filter(email__iexact=email).exists():
            return JsonResponse({'error': 'An account with this email already exists'}, status=400)

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name
        )
        UserProfile.objects.get_or_create(user=user)

        login(request, user, backend='django.contrib.auth.backends.ModelBackend')
        return JsonResponse({
            'status': 'success',
            'message': 'Signup successful',
            'user': serialize_user(user)
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
def auth_login(request):
    """Authenticates credentials, establishes a Django session, and returns user details or an error."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = json.loads(request.body)
        username_or_email = (data.get('username') or data.get('email') or '').strip()
        password = data.get('password') or ''

        if not username_or_email or not password:
            return JsonResponse({'error': 'Username and password are required'}, status=400)

        user = None
        if '@' in username_or_email:
            user_by_email = User.objects.filter(email__iexact=username_or_email).first()
            if user_by_email:
                user = authenticate(request, username=user_by_email.username, password=password)

        if user is None:
            user = authenticate(request, username=username_or_email, password=password)

        if user is None:
            return JsonResponse({'error': 'Invalid username or password'}, status=400)

        login(request, user, backend='django.contrib.auth.backends.ModelBackend')
        return JsonResponse({
            'status': 'success',
            'message': 'Login successful',
            'user': serialize_user(user)
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
def auth_logout(request):
    """Ends the current Django session and returns a logout status."""
    logout(request)
    return JsonResponse({'status': 'success', 'message': 'Logged out successfully'})


@csrf_exempt
def auth_me(request):
    """Reports whether the request has an authenticated user and returns the user's serialized details."""
    if request.user and request.user.is_authenticated:
        return JsonResponse({
            'authenticated': True,
            'user': serialize_user(request.user)
        })
    return JsonResponse({
        'authenticated': False,
        'user': None
    })


@csrf_exempt
def auth_google(request):
    """Accepts Google identity information, finds or creates the matching local account/profile, and establishes a session."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = json.loads(request.body)
        google_data = {}
        credential = data.get('credential')
        if credential:
            decoded = decode_jwt_payload(credential)
            if decoded:
                google_data = decoded

        email = (google_data.get('email') or data.get('email') or '').strip()
        google_id = (google_data.get('sub') or data.get('google_id') or data.get('sub') or '').strip()
        name = (google_data.get('name') or data.get('name') or data.get('display_name') or '').strip()
        picture = (google_data.get('picture') or data.get('picture') or data.get('avatar_url') or '').strip()
        given_name = (google_data.get('given_name') or data.get('given_name') or '').strip()
        family_name = (google_data.get('family_name') or data.get('family_name') or '').strip()

        if not given_name and name:
            parts = name.split()
            given_name = parts[0]
            if len(parts) > 1:
                family_name = ' '.join(parts[1:])

        if not email and not google_id:
            return JsonResponse({'error': 'Valid Google credentials or email required'}, status=400)

        user = None
        if google_id:
            profile = UserProfile.objects.filter(google_id=google_id).first()
            if profile:
                user = profile.user

        if user is None and email:
            user = User.objects.filter(email__iexact=email).first()

        if user is not None:
            # Update user first/last name if provided
            user_changed = False
            if given_name and user.first_name != given_name:
                user.first_name = given_name
                user_changed = True
            if family_name and user.last_name != family_name:
                user.last_name = family_name
                user_changed = True
            if user_changed:
                user.save()

            # Update user profile
            profile, _ = UserProfile.objects.get_or_create(user=user)
            updated = False
            if google_id and profile.google_id != google_id:
                profile.google_id = google_id
                updated = True
            if picture and profile.avatar_url != picture:
                profile.avatar_url = picture
                updated = True
            if updated:
                profile.save()
        else:
            # Create new user
            raw_base = email.split('@')[0] if email else (name.replace(' ', '_').lower() or f"google_{google_id[:6]}")
            base_username = re.sub(r'[^a-zA-Z0-9_.]', '', raw_base) or 'google_user'
            username = base_username
            counter = 1
            while User.objects.filter(username__iexact=username).exists():
                username = f"{base_username}_{counter}"
                counter += 1

            user = User.objects.create_user(
                username=username,
                email=email,
                first_name=given_name,
                last_name=family_name
            )
            user.set_unusable_password()
            user.save()
            UserProfile.objects.create(
                user=user,
                google_id=google_id or None,
                avatar_url=picture or None
            )

        login(request, user, backend='django.contrib.auth.backends.ModelBackend')
        return JsonResponse({
            'status': 'success',
            'message': 'Google authentication successful',
            'user': serialize_user(user)
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
def handle_locations(request):
    """Lists locations for GET requests and creates or updates a location for POST requests."""
    if request.method == 'GET':
        user_id = request.GET.get('user_id')
        locations = Location.objects.select_related('user').all().order_by('-created_at')
        if user_id and user_id != 'all' and request.GET.get('filter_by_user') == 'true':
            locations = locations.filter(user_id=user_id)

        data = [
            {
                'id': loc.id,
                'name': loc.name,
                'latitude': loc.latitude,
                'longitude': loc.longitude,
                'description': loc.description,
                'created_at': loc.created_at.isoformat(),
                'user_id': loc.user_id,
                'user_name': loc.user.username if loc.user else None
            }
            for loc in locations
        ]
        return JsonResponse(data, safe=False)

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            name = (data.get('name') or '').strip()
            if not name:
                return JsonResponse({'error': 'Location name is required'}, status=400)

            lat = data.get('latitude')
            lon = data.get('longitude')
            desc = data.get('description', '')
            user = get_request_user(request, data)

            lat_val = float(lat) if lat is not None and str(lat).strip() != '' else None
            lon_val = float(lon) if lon is not None and str(lon).strip() != '' else None

            loc, created = Location.objects.get_or_create(
                name=name,
                defaults={
                    'latitude': lat_val,
                    'longitude': lon_val,
                    'description': desc,
                    'user': user
                }
            )
            if not created:
                if lat_val is not None:
                    loc.latitude = lat_val
                if lon_val is not None:
                    loc.longitude = lon_val
                if desc:
                    loc.description = desc
                if user and not loc.user:
                    loc.user = user
                loc.save()

            return JsonResponse({
                'id': loc.id,
                'name': loc.name,
                'latitude': loc.latitude,
                'longitude': loc.longitude,
                'description': loc.description,
                'created_at': loc.created_at.isoformat(),
                'user_id': loc.user_id,
                'user_name': loc.user.username if loc.user else None,
                'status': 'success'
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    return JsonResponse({'error': 'Invalid method'}, status=405)


@csrf_exempt
def process_file_api(request):
    """Accepts one uploaded CSV and returns the result of `process_geophone_csv()`."""
    if request.method == 'POST' and request.FILES.get('file'):
        file_obj = request.FILES['file']
        result = process_geophone_csv(file_obj, filename=file_obj.name)
        if result.get('ok'):
            return JsonResponse(result)
        return JsonResponse({'error': result.get('reason', 'Unknown error')}, status=400)
    return JsonResponse({'error': 'Invalid request'}, status=400)

@csrf_exempt
def save_labels_batch(request):
    """Creates/updates AnomalyLabel + EventFeatures for multiple events in one request."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid method'}, status=405)
    try:
        data = json.loads(request.body)
        events = data.get('events', [])
        if not events:
            return JsonResponse({'error': 'No events provided'}, status=400)

        user = get_request_user(request, data)
        location_id = data.get('location_id')
        location = Location.objects.filter(id=location_id).first() if location_id else None

        results = []
        with transaction.atomic():
            for item in events:
                start_ms, end_ms = round(item['startTime']), round(item['endTime'])
                event_id = f"{item['file']}_{start_ms}_{end_ms}"

                file_batch, _ = FileBatch.objects.get_or_create(
                    filename=item['file'], defaults={'user': user, 'location': location}
                )
                if location and file_batch.location != location:
                    file_batch.location = location
                if user and not file_batch.user:
                    file_batch.user = user
                file_batch.save()

                if not item.get('label') and not item.get('note'):
                    AnomalyLabel.objects.filter(id=event_id).delete()
                    results.append({'id': event_id, 'status': 'cleared'})
                    continue

                label_obj, _ = AnomalyLabel.objects.update_or_create(
                    id=event_id,
                    defaults={
                        'user': user, 'file_batch': file_batch, 'location': location,
                        'start_time': str(item['startTime']), 'end_time': str(item['endTime']),
                        'duration': item.get('duration', 0), 'peak_score': item.get('peakScore', 0),
                        'label_type': item['label'], 'note': item.get('note', ''),
                        'suggested_label': item.get('suggested_label') or None,
                        'suggested_confidence': float(item['suggested_confidence']) if item.get('suggested_confidence') is not None else None,
                        'suggested_by': ClassifierRun.objects.filter(pk=item.get('suggested_by_id')).first() if item.get('suggested_by_id') else None,
                    }
                )
                if item.get('times') and item.get('volts'):
                    try:
                        features = extract_event_features(item['times'], item['volts'], item['startTime'], item['endTime'])
                        EventFeatures.objects.update_or_create(
                            anomaly_label=label_obj, defaults={'values': features, 'extractor_version': FEATURE_VERSION}
                        )
                    except ValueError:
                        pass
                results.append({'id': event_id, 'status': 'success'})

        return JsonResponse({'status': 'success', 'results': results})
    except Exception as e:
        print(f"SAVE LABELS BATCH ERROR: {str(e)}")
        return JsonResponse({'error': str(e)}, status=400)

@csrf_exempt
def save_label(request):
    """Creates, updates, or clears an anomaly label; can also save the labeled interval as a known event."""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            user = get_request_user(request, data)

            # Generate deterministic composite ID
            file_name = data['file']
            start_ms = round(data['startTime'])
            end_ms = round(data['endTime'])
            event_id = f"{file_name}_{start_ms}_{end_ms}"

            location_id = data.get('location_id')
            location = Location.objects.filter(id=location_id).first() if location_id else None

            file_batch, _ = FileBatch.objects.get_or_create(
                filename=file_name,
                defaults={'user': user, 'location': location}
            )
            if location and file_batch.location != location:
                file_batch.location = location
            if user and not file_batch.user:
                file_batch.user = user
            file_batch.save()

            # If user cleared the label, remove it
            if not data.get('label') and not data.get('note'):
                AnomalyLabel.objects.filter(id=event_id).delete()
                return JsonResponse({'status': 'cleared'})

            # Update or create the event
            label_obj, _ = AnomalyLabel.objects.update_or_create(
                id=event_id,
                defaults={
                    'user': user,
                    'file_batch': file_batch,
                    'location': location,
                    'start_time': str(data['startTime']),
                    'end_time': str(data['endTime']),
                    'duration': data.get('duration', 0),
                    'peak_score': data.get('peakScore', 0),
                    'label_type': data['label'],
                    'note': data.get('note', ''),
                    'suggested_label': data.get('suggested_label') or None,
                    'suggested_confidence': float(data['suggested_confidence']) if data.get('suggested_confidence') is not None else None,
                    'suggested_by': ClassifierRun.objects.filter(pk=data.get('suggested_by_id')).first() if data.get('suggested_by_id') else None,
                }
            )

            # Samples are supplied by triage while still resident in the scanned chunk.
            if data.get('times') and data.get('volts'):
                try:
                    features = extract_event_features(data['times'], data['volts'], data['startTime'], data['endTime'])
                    EventFeatures.objects.update_or_create(
                        anomaly_label=label_obj,
                        defaults={'values': features, 'extractor_version': FEATURE_VERSION},
                    )
                except ValueError:
                    pass

            # Check if user requested saving as known event as well
            if data.get('save_as_known_event'):
                event_name = data.get('label') or 'Labeled Event'
                start_time = float(data['startTime'])
                end_time = float(data['endTime'])
                KnownEvent.objects.create(
                    user=user,
                    location=location,
                    date=datetime.fromtimestamp(start_time / 1000).date(),
                    time_start=start_time,
                    time_end=end_time,
                    time_precision='exact',
                    event_type=event_name,
                    description='',
                    notes=data.get('note', ''),
                )

            return JsonResponse({
                'status': 'success',
                'id': event_id,
                'user_id': user.id if user else None,
                'user_name': user.username if user else None
            })
        except Exception as e:
            print(f"SAVE LABEL ERROR: {str(e)}")
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Invalid method'}, status=405)


@csrf_exempt
def get_labels_api(request):
    """Returns saved anomaly labels, optionally filtered by location and user."""
    if request.method == 'GET':
        location_id = request.GET.get('location_id')
        user_id = request.GET.get('user_id')
        qs = AnomalyLabel.objects.select_related('file_batch', 'location', 'file_batch__location', 'user').all()
        if location_id and location_id != 'all':
            qs = qs.filter(location_id=location_id) | qs.filter(file_batch__location_id=location_id)
        if user_id and user_id != 'all':
            qs = qs.filter(user_id=user_id)
        qs = qs.order_by('-saved_at')

        results = []
        for l in qs:
            loc_name = l.location.name if l.location else (l.file_batch.location.name if l.file_batch and l.file_batch.location else None)
            results.append({
                'id': l.id,
                'file_name': l.file_batch.filename if l.file_batch else 'Unknown',
                'start_time': l.start_time,
                'end_time': l.end_time,
                'duration': l.duration,
                'peak_score': l.peak_score,
                'label': l.label_type,
                'note': l.note or '',
                'location_name': loc_name,
                'location_id': l.location_id or (l.file_batch.location_id if l.file_batch else None),
                'saved_at': l.saved_at.isoformat() if l.saved_at else '',
                'user_id': l.user_id,
                'user_name': l.user.username if l.user else None
            })
        return JsonResponse(results, safe=False)
    return JsonResponse({'error': 'Invalid method'}, status=405)


@csrf_exempt
def get_event_plot(request):
    """Accepts raw waveform arrays or uploaded files and returns a generated event plot."""
    if request.method == 'POST':
        start_ms = None
        end_ms = None
        files = []
        times = None
        volts = None

        if request.content_type and 'application/json' in request.content_type:
            try:
                data = json.loads(request.body)
                start_ms = data.get('start_time') or data.get('event_start')
                end_ms = data.get('end_time') or data.get('event_end')
                times = data.get('times')
                volts = data.get('volts')
            except Exception as e:
                return JsonResponse({'error': f'Invalid JSON: {str(e)}'}, status=400)
        else:
            files = request.FILES.getlist('files')
            start_ms = request.POST.get('start_time') or request.POST.get('event_start')
            end_ms = request.POST.get('end_time') or request.POST.get('event_end')

        if times is not None and volts is not None and len(times) > 0 and len(volts) > 0:
            result = generate_event_plot_from_data(times, volts, start_ms, end_ms)
        elif files:
            result = generate_event_plot(files, start_ms, end_ms)
        else:
            return JsonResponse({'error': 'No waveform data or files provided for plot generation'}, status=400)

        if result.get('ok'):
            return JsonResponse({'ok': True, 'image': result['image'], 'image_base64': result.get('image_base64', result['image'])})
        return JsonResponse({'error': result.get('reason', 'Plot generation failed')}, status=400)
    return JsonResponse({'error': 'Invalid request method. POST expected.'}, status=405)


@csrf_exempt
def process_chunk_api(request):
    """Registers uploaded file batches, processes the files as one chunk, and includes any existing labels in the response."""
    if request.method == 'POST':
        files = request.FILES.getlist('files')
        filenames = [f.name for f in files]
        location_id = request.POST.get('location_id')
        user = get_request_user(request)

        if not files:
            return JsonResponse({'error': 'No files uploaded'}, status=400)

        location = Location.objects.filter(id=location_id).first() if location_id else None

        for fname in filenames:
            fb, created = FileBatch.objects.get_or_create(
                filename=fname,
                defaults={'user': user, 'location': location}
            )
            if location and fb.location != location:
                fb.location = location
            if user and not fb.user:
                fb.user = user
            fb.save()

        result = process_geophone_chunk(files, filenames)

        if result.get('ok'):
            # Fetch existing labels for these specific files from the database
            existing_records = AnomalyLabel.objects.filter(file_batch__filename__in=filenames)

            # Map them by the deterministic ID so React can match them to the events
            existing_labels = {
                record.id: {'label': record.label_type, 'note': record.note}
                for record in existing_records
            }

            # Inject existing labels into the response payload
            result['existing_labels'] = existing_labels
            return JsonResponse(result)

        return JsonResponse({'error': result.get('reason', 'Unknown error'), 'missing': result.get('missing', [])},
                            status=400)
    return JsonResponse({'error': 'Invalid request'}, status=400)


@csrf_exempt
def suggest_label_api(request):
    """Suggest a category for an event waveform using the latest trained model."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = json.loads(request.body)
        features = extract_event_features(data.get('times', []), data.get('volts', []), data.get('start_time'), data.get('end_time'))
        suggestion = suggest_label(features)
        return JsonResponse({'suggestion': suggestion})
    except (ValueError, TypeError) as exc:
        return JsonResponse({'error': str(exc), 'suggestion': None}, status=400)


@csrf_exempt
def model_metadata_api(request):
    """Returns the latest offline model evaluation metadata, if available."""
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    import os
    if not os.path.exists(METADATA_PATH):
        return JsonResponse({'trained': False})
    try:
        with open(METADATA_PATH, encoding='utf-8') as metadata_file:
            return JsonResponse({'trained': True, **json.load(metadata_file)})
    except (OSError, ValueError):
        return JsonResponse({'trained': False, 'error': 'Training metadata is unavailable'}, status=500)


@csrf_exempt
def handle_known_events(request):
    """Lists, creates, updates, or deletes known events according to the HTTP method and request action."""
    if request.method == 'GET':
        events_query = KnownEvent.objects.select_related('user', 'location').all()
        location_id = request.GET.get('location_id')
        user_id = request.GET.get('user_id')
        if location_id and location_id != 'all':
            events_query = events_query.filter(location_id=location_id)
        if user_id and user_id != 'all':
            events_query = events_query.filter(user_id=user_id)
        events = [_serialize_known_event(event) for event in events_query.order_by('date', 'time_start')]
        return JsonResponse(events, safe=False)

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            action = data.get('action')
            method_override = data.get('_method', '').upper()
            event_id = data.get('id') or data.get('event_id')

            if action == 'delete' or method_override == 'DELETE':
                if not event_id:
                    return JsonResponse({'error': 'Event ID required for delete'}, status=400)
                event = KnownEvent.objects.filter(id=event_id).first()
                if not event:
                    return JsonResponse({'error': 'Event not found'}, status=404)
                deleted_id = event.id
                event.delete()
                return JsonResponse({'status': 'deleted', 'id': deleted_id})

            if action == 'update' or method_override in ('PUT', 'PATCH') or (event_id and ('name' in data or 'event_type' in data)):
                return _update_known_event(request, event_id, data)

            return _create_known_event(request, data)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    elif request.method in ('PUT', 'PATCH'):
        try:
            data = json.loads(request.body)
            event_id = data.get('id') or data.get('event_id') or request.GET.get('id')
            if not event_id:
                return JsonResponse({'error': 'Event ID is required'}, status=400)
            return _update_known_event(request, event_id, data)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            event_id = request.GET.get('id') or request.GET.get('event_id')
            if not event_id and request.body:
                try:
                    data = json.loads(request.body)
                    event_id = data.get('id') or data.get('event_id')
                except Exception:
                    pass
            if not event_id:
                return JsonResponse({'error': 'Event ID is required'}, status=400)
            event = KnownEvent.objects.filter(id=event_id).first()
            if not event:
                return JsonResponse({'error': 'Event not found'}, status=404)
            deleted_id = event.id
            event.delete()
            return JsonResponse({'status': 'deleted', 'id': deleted_id})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    return JsonResponse({'error': 'Invalid method'}, status=405)


def _create_known_event(request, data):
    """Validates and creates a known event, returning an overlap warning unless the request forces creation."""
    try:
        values = _known_event_values(data)
    except (KeyError, TypeError, ValueError) as exc:
        return JsonResponse({'error': str(exc)}, status=400)
    force = data.get('force', False)
    collisions = _known_event_collisions(values['date'], values['time_start'], values['time_end'])

    if collisions and not force:
        return JsonResponse({
            'status': 'collision_warning',
            'collisions': collisions,
            'message': f"Collides with {len(collisions)} existing known event(s)."
        })

    request_user = getattr(request, 'user', None)
    user = request_user if getattr(request_user, 'is_authenticated', False) else None
    event = KnownEvent.objects.create(user=user, **values)
    return JsonResponse({**_serialize_known_event(event), 'status': 'success'})


def _update_known_event(request, event_id, data):
    """Updates a known event, checking for overlaps with other events unless forced."""
    event = KnownEvent.objects.filter(id=event_id).first()
    if not event:
        return JsonResponse({'error': 'Event not found'}, status=404)
    try:
        values = _known_event_values(data, existing=event)
    except (KeyError, TypeError, ValueError) as exc:
        return JsonResponse({'error': str(exc)}, status=400)
    force = data.get('force', False)
    collisions = _known_event_collisions(values['date'], values['time_start'], values['time_end'], exclude_id=event.id)

    if collisions and not force:
        return JsonResponse({
            'status': 'collision_warning',
            'collisions': collisions,
            'message': f"Collides with {len(collisions)} existing known event(s)."
        })

    for field, value in values.items():
        setattr(event, field, value)
    event.save()
    return JsonResponse({**_serialize_known_event(event), 'status': 'success'})


def _known_event_values(data, existing=None):
    """Validate canonical known-event fields, while accepting legacy API aliases."""
    start_raw = data.get('time_start', data.get('start_time', existing.time_start if existing else None))
    end_raw = data.get('time_end', data.get('end_time', existing.time_end if existing else None))
    if start_raw is None:
        raise ValueError('Start time is required.')
    date_value = data.get('date') or (existing.date.isoformat() if existing and existing.date else None)
    event_date, start_time, end_time = _parse_known_event_times(start_raw, end_raw, date_value)
    if end_time == start_time:
        raise ValueError('End time must differ from start time.')
    start_datetime = datetime.combine(event_date, start_time)
    end_datetime = datetime.combine(event_date, end_time) if end_time is not None else None
    if end_datetime is not None and end_datetime <= start_datetime:
        end_datetime += timedelta(days=1)
    event_type = (data.get('event_type', data.get('name', existing.event_type if existing else '')) or '').strip()
    if not event_type:
        raise ValueError('Event type is required.')
    trust_score = int(data.get('trust_score', existing.trust_score if existing else 100))
    if not 0 <= trust_score <= 100:
        raise ValueError('Trust score must be between 0 and 100.')
    return {
        'date': event_date,
        'time_start': start_datetime.timestamp() * 1000,
        'time_end': end_datetime.timestamp() * 1000 if end_datetime else None,
        'time_precision': data.get('time_precision', existing.time_precision if existing else 'unknown'),
        'event_type': event_type,
        'size_estimate': data.get('size_estimate', existing.size_estimate if existing else ''),
        'distance_from_sensor_m': float(data['distance_from_sensor_m']) if data.get('distance_from_sensor_m') not in (None, '') else (existing.distance_from_sensor_m if existing else None),
        'description': data.get('description', existing.description if existing else ''),
        'notes': data.get('notes', data.get('note', existing.notes if existing else '')),
        'trust_score': trust_score,
        'location': _known_event_location(data, existing),
    }


def _parse_known_event_times(start_raw, end_raw, date_value=None):
    """Parse clock values and legacy millisecond timestamps into a date plus clock times."""
    legacy_start = None
    try:
        numeric_start = float(start_raw)
        legacy_start = datetime.fromtimestamp(numeric_start / 1000 if numeric_start > 1e11 else numeric_start)
        start_time = legacy_start.time()
    except (ValueError, TypeError, OverflowError, OSError):
        start_time = datetime_time.fromisoformat(str(start_raw))

    if date_value:
        event_date = date_value if isinstance(date_value, date) else date.fromisoformat(str(date_value))
    elif legacy_start:
        event_date = legacy_start.date()
    else:
        raise ValueError('Date is required when using a clock time.')

    if end_raw in (None, ''):
        end_time = None
    else:
        try:
            numeric_end = float(end_raw)
            end_time = datetime.fromtimestamp(numeric_end / 1000 if numeric_end > 1e11 else numeric_end).time()
        except (ValueError, TypeError, OverflowError, OSError):
            end_time = datetime_time.fromisoformat(str(end_raw))
    return event_date, start_time, end_time


def _known_event_datetimes(event_date, start_time, end_time):
    """Normalize clock values and legacy/current timestamp values to datetimes."""
    start_dt, _ = _known_event_datetime(event_date, start_time)
    if end_time is None:
        return start_dt, None
    end_dt, end_is_absolute = _known_event_datetime(start_dt.date(), end_time)
    if not end_is_absolute and end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return start_dt, end_dt


def _known_event_datetime(event_date, value):
    """Convert a stored millisecond timestamp or a clock value to a datetime."""
    if isinstance(value, datetime):
        return value, True
    try:
        numeric = float(value)
        timestamp = numeric / 1000 if numeric > 1e11 else numeric
        return datetime.fromtimestamp(timestamp), True
    except (ValueError, TypeError, OverflowError, OSError):
        clock_time = value if isinstance(value, datetime_time) else datetime_time.fromisoformat(str(value))
        if event_date is None:
            raise ValueError('Date is required to interpret a clock time.')
        return datetime.combine(event_date, clock_time), False


def _known_event_collisions(event_date, start_time, end_time, exclude_id=None):
    if end_time is None:
        return []
    requested_start, requested_end = _known_event_datetimes(event_date, start_time, end_time)
    collisions = []
    queryset = KnownEvent.objects.select_related('location', 'user').all()
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)
    for event in queryset:
        event_start, event_end = _known_event_datetimes(event.date, event.time_start, event.time_end)
        if event_end is None:
            overlaps = requested_start <= event_start <= requested_end
        else:
            overlaps = event_start < requested_end and event_end > requested_start
        if overlaps:
            collisions.append(_serialize_known_event(event))
    return collisions


def _known_event_location(data, existing=None):
    location_id = data.get('location_id', existing.location_id if existing else None)
    if location_id in (None, ''):
        return None
    location = Location.objects.filter(pk=location_id).first()
    if location is None:
        raise ValueError('Selected location does not exist.')
    return location


def _serialize_known_event(event):
    """Build the known-event API object, including timestamp aliases used by older clients."""
    start_datetime, end_datetime = _known_event_datetimes(event.date, event.time_start, event.time_end)
    start_timestamp = start_datetime.timestamp() * 1000
    end_timestamp = end_datetime.timestamp() * 1000 if end_datetime else None
    return {
        'id': event.id,
        'date': start_datetime.date().isoformat(),
        'time_start': start_datetime.time().isoformat(),
        'time_end': end_datetime.time().isoformat() if end_datetime else None,
        'time_precision': event.time_precision,
        'event_type': event.event_type,
        'size_estimate': event.size_estimate,
        'distance_from_sensor_m': event.distance_from_sensor_m,
        'description': event.description,
        'notes': event.notes,
        'trust_score': event.trust_score,
        'location_id': event.location_id,
        'location_name': event.location.name if event.location else None,
        'user_id': event.user_id,
        'user_name': event.user.username if event.user else None,
        'name': event.event_type,
        'start_time': start_timestamp,
        'end_time': end_timestamp,
        'note': event.notes,
        'duration': max(0, (end_datetime - start_datetime).total_seconds()) if end_datetime else 0,
    }


@csrf_exempt
def handle_known_event_detail(request, event_id):
    """Reads, updates, or deletes one known event addressed by ID."""
    event = KnownEvent.objects.filter(id=event_id).first()
    if not event:
        return JsonResponse({'error': 'Event not found'}, status=404)

    if request.method == 'GET':
        return JsonResponse(_serialize_known_event(event))

    elif request.method in ('PUT', 'PATCH', 'POST'):
        try:
            data = json.loads(request.body)
            if data.get('action') == 'delete' or data.get('_method', '').upper() == 'DELETE':
                deleted_id = event.id
                event.delete()
                return JsonResponse({'status': 'deleted', 'id': deleted_id})
            return _update_known_event(request, event_id, data)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        deleted_id = event.id
        event.delete()
        return JsonResponse({'status': 'deleted', 'id': deleted_id})

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def check_event_collision(request):
    """Finds known events whose time intervals overlap a supplied interval, optionally filtering by location or excluding an event ID."""
    try:
        if request.method == 'POST':
            data = json.loads(request.body)
        else:
            data = request.GET

        start_raw = data.get('time_start', data.get('start_time'))
        end_raw = data.get('time_end', data.get('end_time'))
        if start_raw is None:
            raise ValueError('Start time is required.')
        event_date, start_time, end_time = _parse_known_event_times(start_raw, end_raw, data.get('date'))
        exclude_id = data.get('exclude_id') or data.get('event_id') or data.get('id')
        try:
            exclude_id = int(exclude_id) if exclude_id else None
        except (ValueError, TypeError):
            exclude_id = None
        collisions = _known_event_collisions(event_date, start_time, end_time, exclude_id=exclude_id)

        return JsonResponse({
            'has_collision': len(collisions) > 0,
            'collisions': collisions
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)
