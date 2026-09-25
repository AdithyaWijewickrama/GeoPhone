from django.core.management.base import BaseCommand, CommandError

from geobench.ml_classifier import train_classifier
from geobench.models import ClassifierRun, EventFeatures
from datetime import datetime
import uuid


class Command(BaseCommand):
    help = 'Train the event classifier from saved human labels and waveform features.'

    def handle(self, *args, **options):
        try:
            metadata = train_classifier(EventFeatures.objects.select_related('anomaly_label', 'anomaly_label__file_batch').all())
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        per_class = metadata.get('per_class') or {}
        ClassifierRun.objects.create(
            version=datetime.now().strftime('%Y%m%d%H%M%S') + uuid.uuid4().hex[:6],
            feature_extractor_version=metadata['feature_extractor_version'],
            training_row_count=metadata['row_count'],
            class_counts=metadata['class_counts'],
            held_out_batches=metadata['held_out_day'].split(',') if metadata.get('held_out_day') else None,
            metrics={
                metric: {label: values.get(metric, 0) for label, values in per_class.items()}
                for metric in ('precision', 'recall', 'f1')
            },
            model_file=metadata['model_file'],
            notes=metadata.get('evaluation_note'),
        )
        self.stdout.write(self.style.SUCCESS(
            f"Trained on {metadata['row_count']} events across {len(metadata['class_counts'])} classes."
        ))
