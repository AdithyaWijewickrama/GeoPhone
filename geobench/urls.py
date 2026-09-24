from django.urls import path

from . import views

urlpatterns = [
    # Auth endpoints
    path('api/auth/signup/', views.auth_signup, name='auth_signup'),
    path('api/auth/login/', views.auth_login, name='auth_login'),
    path('api/auth/logout/', views.auth_logout, name='auth_logout'),
    path('api/auth/me/', views.auth_me, name='auth_me'),
    path('api/auth/google/', views.auth_google, name='auth_google'),

    # ML & data endpoints
    path('api/locations/', views.handle_locations, name='locations'),
    path('api/process-file/', views.process_file_api, name='process_file'),
    path('api/save-label/', views.save_label, name='save_label'),
    path('api/labels/', views.get_labels_api, name='get_labels'),
    path('api/generate-plot/', views.get_event_plot, name='get_event_plot'),
    path('api/plot-event/', views.get_event_plot, name='plot_event'),
    path('api/process-chunk/', views.process_chunk_api, name='process_chunk'),
    path('api/known-events/', views.handle_known_events, name='known_events'),
    path('api/known-events/check-collision/', views.check_event_collision, name='check_event_collision'),
]
