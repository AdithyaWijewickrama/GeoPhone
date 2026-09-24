import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .ml_model import process_geophone_csv, generate_event_plot, process_geophone_chunk
from .models import Location, FileBatch, AnomalyLabel, KnownEvent, EventLabel


@csrf_exempt
def handle_locations(request):
    if request.method == 'GET':
        locations = Location.objects.all().order_by('-created_at')
        data = [
            {
                'id': loc.id,
                'name': loc.name,
                'latitude': loc.latitude,
                'longitude': loc.longitude,
                'description': loc.description,
                'created_at': loc.created_at.isoformat()
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

            lat_val = float(lat) if lat is not None and str(lat).strip() != '' else None
            lon_val = float(lon) if lon is not None and str(lon).strip() != '' else None

            loc, created = Location.objects.get_or_create(
                name=name,
                defaults={
                    'latitude': lat_val,
                    'longitude': lon_val,
                    'description': desc
                }
            )
            if not created:
                if lat_val is not None:
                    loc.latitude = lat_val
                if lon_val is not None:
                    loc.longitude = lon_val
                if desc:
                    loc.description = desc
                loc.save()

            return JsonResponse({
                'id': loc.id,
                'name': loc.name,
                'latitude': loc.latitude,
                'longitude': loc.longitude,
                'description': loc.description,
                'created_at': loc.created_at.isoformat(),
                'status': 'success'
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    return JsonResponse({'error': 'Invalid method'}, status=405)


@csrf_exempt
def process_file_api(request):
    if request.method == 'POST' and request.FILES.get('file'):
        file_obj = request.FILES['file']
        result = process_geophone_csv(file_obj)
        if result.get('ok'):
            return JsonResponse(result)
        return JsonResponse({'error': result.get('reason', 'Unknown error')}, status=400)
    return JsonResponse({'error': 'Invalid request'}, status=400)


@csrf_exempt
def save_label(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)

            # Generate deterministic composite ID
            file_name = data['file']
            start_ms = round(data['startTime'])
            end_ms = round(data['endTime'])
            event_id = f"{file_name}_{start_ms}_{end_ms}"

            location_id = data.get('location_id')
            location = Location.objects.filter(id=location_id).first() if location_id else None

            file_batch, _ = FileBatch.objects.get_or_create(filename=file_name)
            if location and file_batch.location != location:
                file_batch.location = location
                file_batch.save()

            # If user cleared the label, remove it
            if not data.get('label') and not data.get('note'):
                AnomalyLabel.objects.filter(id=event_id).delete()
                return JsonResponse({'status': 'cleared'})

            # Update or create the event
            AnomalyLabel.objects.update_or_create(
                id=event_id,
                defaults={
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
                    name=event_name,
                    start_time=data['startTime'],
                    end_time=data['endTime'],
                    location=location,
                    note=data.get('note', '')
                )

            return JsonResponse({'status': 'success', 'id': event_id})
        except Exception as e:
            print(f"SAVE LABEL ERROR: {str(e)}")
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Invalid method'}, status=405)


@csrf_exempt
def get_labels_api(request):
    if request.method == 'GET':
        location_id = request.GET.get('location_id')
        qs = AnomalyLabel.objects.select_related('file_batch', 'location', 'file_batch__location').all()
        if location_id and location_id != 'all':
            qs = qs.filter(location_id=location_id) | qs.filter(file_batch__location_id=location_id)
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
                'saved_at': l.saved_at.isoformat() if l.saved_at else ''
            })
        return JsonResponse(results, safe=False)
    return JsonResponse({'error': 'Invalid method'}, status=405)


@csrf_exempt
def get_event_plot(request):
    if request.method == 'POST':
        files = request.FILES.getlist('files')
        start_ms = request.POST.get('start_time')
        end_ms = request.POST.get('end_time')

        result = generate_event_plot(files, start_ms, end_ms)

        if result.get('ok'):
            return JsonResponse({'image': result['image']})
        return JsonResponse({'error': result.get('reason', 'Plot generation failed')}, status=400)
    return JsonResponse({'error': 'Invalid request'}, status=400)


@csrf_exempt
def process_chunk_api(request):
    if request.method == 'POST':
        files = request.FILES.getlist('files')
        filenames = [f.name for f in files]
        location_id = request.POST.get('location_id')

        if not files:
            return JsonResponse({'error': 'No files uploaded'}, status=400)

        location = Location.objects.filter(id=location_id).first() if location_id else None

        for fname in filenames:
            fb, _ = FileBatch.objects.get_or_create(filename=fname)
            if location and fb.location != location:
                fb.location = location
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
    if request.method == 'GET':
        location_id = request.GET.get('location_id')
        qs = KnownEvent.objects.select_related('location').all()
        if location_id and location_id != 'all':
            qs = qs.filter(location_id=location_id)

        events = [
            {
                'id': e.id,
                'name': e.name,
                'start_time': e.start_time,
                'end_time': e.end_time,
                'note': e.note or '',
                'location_id': e.location_id,
                'location_name': e.location.name if e.location else None
            }
            for e in qs.order_by('start_time')
        ]
        return JsonResponse(events, safe=False)

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            name = (data.get('name') or '').strip()
            if not name:
                return JsonResponse({'error': 'Event name is required'}, status=400)

            start_time = float(data['start_time'])
            end_time = float(data['end_time'])
            location_id = data.get('location_id')
            note = data.get('note', '')
            force = data.get('force', False)

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
                'note': event.note,
                'status': 'success'
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    return JsonResponse({'error': 'Invalid method'}, status=405)


@csrf_exempt
def check_event_collision(request):
    try:
        if request.method == 'POST':
            data = json.loads(request.body)
        else:
            data = request.GET

        start_time = float(data.get('start_time', 0))
        end_time = float(data.get('end_time', 0))
        location_id = data.get('location_id')

        qs = KnownEvent.objects.filter(start_time__lt=end_time, end_time__gt=start_time)
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