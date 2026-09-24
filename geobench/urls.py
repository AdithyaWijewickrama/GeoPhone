from django.urls import path

from . import views

urlpatterns = [
    path('api/locations/', views.handle_locations, name='locations'),
    path('api/process-file/', views.process_file_api, name='process_file'),
    path('api/save-label/', views.save_label, name='save_label'),
    path('api/labels/', views.get_labels_api, name='get_labels'),
    path('api/generate-plot/', views.get_event_plot, name='get_event_plot'),
    path('api/process-chunk/', views.process_chunk_api, name='process_chunk'),
    path('api/known-events/', views.handle_known_events, name='known_events'),
    path('api/known-events/check-collision/', views.check_event_collision, name='check_event_collision'),
]
