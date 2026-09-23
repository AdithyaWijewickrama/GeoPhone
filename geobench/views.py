import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .models import FileBatch, AnomalyLabel
from .ml_model import process_geophone_csv

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
            file_batch, _ = FileBatch.objects.get_or_create(filename=data['file'])

            if not data.get('label') and not data.get('note'):
                AnomalyLabel.objects.filter(
                    file_batch=file_batch,
                    start_time=data['startTime'],
                    end_time=data['endTime']
                ).delete()
                return JsonResponse({'status': 'cleared'})

            AnomalyLabel.objects.update_or_create(
                file_batch=file_batch,
                start_time=data['startTime'],
                end_time=data['endTime'],
                defaults={
                    'duration': data.get('duration', 0),
                    'peak_score': data.get('peakScore', 0),
                    'label_type': data['label'],
                    'note': data.get('note', '')
                }
            )
            return JsonResponse({'status': 'success'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Invalid method'}, status=405)

@csrf_exempt
def get_event_plot(request):
    if request.method == 'POST':
        files = request.FILES.getlist('files')  # <-- Change this to getlist('files')
        start_ms = request.POST.get('start_time')
        end_ms = request.POST.get('end_time')

        from .ml_model import generate_event_plot
        result = generate_event_plot(files, start_ms, end_ms)  # <-- Pass the array of files

        if result.get('ok'):
            return JsonResponse({'image': result['image']})
        return JsonResponse({'error': result.get('reason', 'Plot generation failed')}, status=400)
    return JsonResponse({'error': 'Invalid request'}, status=400)

@csrf_exempt
def process_chunk_api(request):
    if request.method == 'POST':
        files = request.FILES.getlist('files')  # Get the array of files
        filenames = [f.name for f in files]

        if not files:
            return JsonResponse({'error': 'No files uploaded'}, status=400)

        from .ml_model import process_geophone_chunk
        result = process_geophone_chunk(files, filenames)

        if result.get('ok'):
            return JsonResponse(result)
        return JsonResponse({'error': result.get('reason', 'Unknown error'), 'missing': result.get('missing', [])},
                            status=400)
    return JsonResponse({'error': 'Invalid request'}, status=400)