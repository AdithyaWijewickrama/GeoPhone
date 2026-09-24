from django.db import models
from django.contrib.auth.models import User


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    google_id = models.CharField(max_length=255, blank=True, null=True, unique=True)
    avatar_url = models.URLField(max_length=1024, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Profile for {self.user.username}"


class Location(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='locations')
    name = models.CharField(max_length=255, unique=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class EventLabel(models.Model):
    id = models.CharField(max_length=255, primary_key=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='event_labels')
    location = models.ForeignKey(Location, on_delete=models.SET_NULL, null=True, blank=True, related_name='event_labels')
    file_name = models.CharField(max_length=255)
    start_time = models.FloatField()
    end_time = models.FloatField()
    duration = models.FloatField()
    peak_score = models.FloatField()
    label = models.CharField(max_length=100)
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.id} - {self.label}"


class FileBatch(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='file_batches')
    location = models.ForeignKey(Location, on_delete=models.SET_NULL, null=True, blank=True, related_name='file_batches')
    filename = models.CharField(max_length=255, unique=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.filename


class AnomalyLabel(models.Model):
    id = models.CharField(max_length=255, primary_key=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='anomaly_labels')
    location = models.ForeignKey(Location, on_delete=models.SET_NULL, null=True, blank=True, related_name='anomaly_labels')
    file_batch = models.ForeignKey(FileBatch, on_delete=models.CASCADE, related_name='labels')
    start_time = models.CharField(max_length=100)
    end_time = models.CharField(max_length=100)
    duration = models.FloatField()
    peak_score = models.FloatField()
    label_type = models.CharField(max_length=100)
    note = models.TextField(blank=True, null=True)
    saved_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('file_batch', 'start_time', 'end_time')

    def __str__(self):
        return f"{self.file_batch.filename} - {self.label_type}"


class KnownEvent(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='known_events')
    location = models.ForeignKey(Location, on_delete=models.SET_NULL, null=True, blank=True, related_name='known_events')
    name = models.CharField(max_length=255)
    start_time = models.FloatField()  # Timestamp in milliseconds
    end_time = models.FloatField()    # Timestamp in milliseconds
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.start_time} - {self.end_time})"