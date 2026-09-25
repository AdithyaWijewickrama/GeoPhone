from django.core.management.base import BaseCommand, CommandError

from geobench.ml_classifier import train_classifier
from geobench.models import EventFeatures


class Command(BaseCommand):
    help = 'Train the event classifier from saved human labels and waveform features.'

    def handle(self, *args, **options):
        try:
            metadata = train_classifier(EventFeatures.objects.select_related('anomaly_label', 'anomaly_label__file_batch').all())
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(
            f"Trained on {metadata['row_count']} events across {len(metadata['class_counts'])} classes."
        ))

