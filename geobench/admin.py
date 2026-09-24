from django.contrib import admin
from .models import Location, EventLabel, FileBatch, AnomalyLabel, KnownEvent, UserProfile

admin.site.register(UserProfile)
admin.site.register(Location)
admin.site.register(EventLabel)
admin.site.register(FileBatch)
admin.site.register(AnomalyLabel)
admin.site.register(KnownEvent)
