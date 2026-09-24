import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .ml_model import process_geophone_csv, generate_event_plot, process_geophone_chunk
from .models import FileBatch, AnomalyLabel, KnownEvent


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

            # Generate the deterministic composite ID matching the React frontend
            file_name = data['file']
            start_ms = round(data['startTime'])
            end_ms = round(data['endTime'])
            event_id = f"{file_name}_{start_ms}_{end_ms}"

            file_batch, _ = FileBatch.objects.get_or_create(filename=file_name)

            # If the user cleared the label in the frontend, delete it from the database
            if not data.get('label') and not data.get('note'):
                AnomalyLabel.objects.filter(id=event_id).delete()
                return JsonResponse({'status': 'cleared'})

            # Update or create the event using the string primary key
            AnomalyLabel.objects.update_or_create(
                id=event_id,
                defaults={
                    'file_batch': file_batch,
                    'start_time': data['startTime'],
                    'end_time': data['endTime'],
                    'duration': data.get('duration', 0),
                    'peak_score': data.get('peakScore', 0),
                    'label_type': data['label'],
                    'note': data.get('note', '')
                }
            )
            print(request.body)
            return JsonResponse({'status': 'success', 'id': event_id})
        except Exception as e:
            print(f"SAVE LABEL ERROR: {str(e)}")
            return JsonResponse({'error': str(e)}, status=400)
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

        if not files:
            return JsonResponse({'error': 'No files uploaded'}, status=400)

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
        events = KnownEvent.objects.all().values('id', 'name', 'start_time', 'end_time')
        return JsonResponse(list(events), safe=False)

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            event = KnownEvent.objects.create(
                name=data['name'],
                start_time=data['start_time'],
                end_time=data['end_time']
            )
            return JsonResponse({'id': event.id, 'status': 'success'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    return JsonResponse({'error': 'Invalid method'}, status=405)