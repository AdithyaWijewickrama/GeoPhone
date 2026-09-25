import base64
import json
import re
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .ml_model import process_geophone_csv, generate_event_plot, generate_event_plot_from_data, process_geophone_chunk
from .models import Location, FileBatch, AnomalyLabel, KnownEvent, EventLabel, UserProfile


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
                    'note': data.get('note', '')
                }
            )

            # Check if user requested saving as known event as well
            if data.get('save_as_known_event'):
                event_name = data.get('label') or 'Labeled Event'
                KnownEvent.objects.create(
                    user=user,
                    name=event_name,
                    start_time=data['startTime'],
                    end_time=data['endTime'],
                    location=location,
                    note=data.get('note', '')
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
def handle_known_events(request):
    """Lists, creates, updates, or deletes known events according to the HTTP method and request action."""
    if request.method == 'GET':
        location_id = request.GET.get('location_id')
        user_id = request.GET.get('user_id')
        qs = KnownEvent.objects.select_related('location', 'user').all()
        if location_id and location_id != 'all':
            qs = qs.filter(location_id=location_id)
        if user_id and user_id != 'all':
            qs = qs.filter(user_id=user_id)

        events = [
            {
                'id': e.id,
                'name': e.name,
                'start_time': e.start_time,
                'end_time': e.end_time,
                'note': e.note or '',
                'location_id': e.location_id,
                'location_name': e.location.name if e.location else None,
                'user_id': e.user_id,
                'user_name': e.user.username if e.user else None
            }
            for e in qs.order_by('start_time')
        ]
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

            if action == 'update' or method_override in ('PUT', 'PATCH') or (event_id and 'name' in data):
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
    name = (data.get('name') or '').strip()
    if not name:
        return JsonResponse({'error': 'Event name is required'}, status=400)

    start_time = float(data['start_time'])
    end_time = float(data['end_time'])
    location_id = data.get('location_id')
    note = data.get('note', '')
    force = data.get('force', False)
    user = get_request_user(request, data)

    # Check collision:
    collisions_qs = KnownEvent.objects.filter(start_time__lt=end_time, end_time__gt=start_time)
    if location_id:
        collisions_qs = collisions_qs.filter(location_id=location_id)
    collisions = [
        {
            'id': c.id,
            'name': c.name,
            'start_time': c.start_time,
            'end_time': c.end_time,
            'location_name': c.location.name if c.location else None
        }
        for c in collisions_qs
    ]

    if collisions and not force:
        return JsonResponse({
            'status': 'collision_warning',
            'collisions': collisions,
            'message': f"Collides with {len(collisions)} existing known event(s)."
        })

    location = Location.objects.filter(id=location_id).first() if location_id else None
    event = KnownEvent.objects.create(
        user=user,
        name=name,
        start_time=start_time,
        end_time=end_time,
        location=location,
        note=note
    )
    return JsonResponse({
        'id': event.id,
        'name': event.name,
        'start_time': event.start_time,
        'end_time': event.end_time,
        'location_id': event.location_id,
        'location_name': event.location.name if event.location else None,
        'user_id': event.user_id,
        'user_name': event.user.username if event.user else None,
        'note': event.note,
        'status': 'success'
    })


def _update_known_event(request, event_id, data):
    """Updates a known event, checking for overlaps with other events unless forced."""
    event = KnownEvent.objects.filter(id=event_id).first()
    if not event:
        return JsonResponse({'error': 'Event not found'}, status=404)

    name = (data.get('name') or event.name).strip()
    if not name:
        return JsonResponse({'error': 'Event name cannot be empty'}, status=400)

    start_time = float(data.get('start_time', event.start_time))
    end_time = float(data.get('end_time', event.end_time))
    location_id = data.get('location_id', event.location_id)
    note = data.get('note', event.note)
    force = data.get('force', False)
    user = get_request_user(request, data) or event.user

    # Collision check excluding current event
    collisions_qs = KnownEvent.objects.filter(start_time__lt=end_time, end_time__gt=start_time).exclude(id=event.id)
    if location_id:
        collisions_qs = collisions_qs.filter(location_id=location_id)
    collisions = [
        {
            'id': c.id,
            'name': c.name,
            'start_time': c.start_time,
            'end_time': c.end_time,
            'location_name': c.location.name if c.location else None
        }
        for c in collisions_qs
    ]

    if collisions and not force:
        return JsonResponse({
            'status': 'collision_warning',
            'collisions': collisions,
            'message': f"Collides with {len(collisions)} existing known event(s)."
        })

    location = Location.objects.filter(id=location_id).first() if location_id else None
    event.name = name
    event.start_time = start_time
    event.end_time = end_time
    event.location = location
    event.note = note
    if user:
        event.user = user
    event.save()

    return JsonResponse({
        'id': event.id,
        'name': event.name,
        'start_time': event.start_time,
        'end_time': event.end_time,
        'location_id': event.location_id,
        'location_name': event.location.name if event.location else None,
        'user_id': event.user_id,
        'user_name': event.user.username if event.user else None,
        'note': event.note,
        'status': 'success'
    })


@csrf_exempt
def handle_known_event_detail(request, event_id):
    """Reads, updates, or deletes one known event addressed by ID."""
    event = KnownEvent.objects.filter(id=event_id).first()
    if not event:
        return JsonResponse({'error': 'Event not found'}, status=404)

    if request.method == 'GET':
        return JsonResponse({
            'id': event.id,
            'name': event.name,
            'start_time': event.start_time,
            'end_time': event.end_time,
            'note': event.note or '',
            'location_id': event.location_id,
            'location_name': event.location.name if event.location else None,
            'user_id': event.user_id,
            'user_name': event.user.username if event.user else None
        })

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

        start_time = float(data.get('start_time', 0))
        end_time = float(data.get('end_time', 0))
        location_id = data.get('location_id')
        exclude_id = data.get('exclude_id') or data.get('event_id') or data.get('id')

        qs = KnownEvent.objects.filter(start_time__lt=end_time, end_time__gt=start_time)
        if exclude_id:
            try:
                qs = qs.exclude(id=int(exclude_id))
            except (ValueError, TypeError):
                pass
        if location_id and str(location_id) != 'all':
            qs = qs.filter(location_id=location_id)

        collisions = [
            {
                'id': c.id,
                'name': c.name,
                'start_time': c.start_time,
                'end_time': c.end_time,
                'location_name': c.location.name if c.location else None
            }
            for c in qs
        ]

        return JsonResponse({
            'has_collision': len(collisions) > 0,
            'collisions': collisions
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)
