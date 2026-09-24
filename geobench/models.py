from django.db import models


class EventLabel(models.Model):
    id = models.CharField(max_length=255, primary_key=True)

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
    filename = models.CharField(max_length=255, unique=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.filename


class AnomalyLabel(models.Model):
    id = models.CharField(max_length=255, primary_key=True)
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
    name = models.CharField(max_length=255)
    start_time = models.FloatField()  # Timestamp in milliseconds
    end_time = models.FloatField()    # Timestamp in milliseconds
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.start_time} - {self.end_time})"