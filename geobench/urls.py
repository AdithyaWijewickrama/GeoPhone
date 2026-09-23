from django.urls import path

from . import views

urlpatterns = [
    path('api/process-file/', views.process_file_api, name='process_file'),
    path('api/save-label/', views.save_label, name='save_label'),
    path('api/generate-plot/', views.get_event_plot, name='get_event_plot'),
    path('api/process-chunk/', views.process_chunk_api, name='process_chunk'),
]
