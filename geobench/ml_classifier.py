"""Training and inference helpers for the supervised event classifier."""
import json
import os
import pickle
from datetime import datetime, timezone

import numpy as np
from django.conf import settings
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import precision_recall_fscore_support, accuracy_score
from sklearn.model_selection import GroupShuffleSplit

from .ml_features import FEATURE_VERSION

ARTIFACT_DIR = os.path.join(settings.BASE_DIR, 'ml_artifacts')
MODEL_PATH = os.path.join(ARTIFACT_DIR, 'event_classifier.pkl')
METADATA_PATH = os.path.join(ARTIFACT_DIR, 'latest_training.json')


def _event_day(record):
    """Derive a grouping day from the batch filename or label timestamp."""
    import re
    match = re.search(r'(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)', record.anomaly_label.file_batch.filename)
    return '-'.join(match.groups()) if match else record.anomaly_label.saved_at.date().isoformat()


def train_classifier(records):
    rows = list(records.select_related('anomaly_label__file_batch').order_by('id'))
    if len(rows) < 2:
        raise ValueError('At least two labeled events with extracted features are required.')
    feature_names = sorted(rows[0].values)
    X = np.asarray([[float(row.values.get(name, 0)) for name in feature_names] for row in rows])
    y = np.asarray([row.anomaly_label.label_type for row in rows])
    groups = np.asarray([_event_day(row) for row in rows])
    classes, counts = np.unique(y, return_counts=True)
    if len(classes) < 2:
        raise ValueError('At least two distinct labels are required to train a classifier.')
    holdout_day = None
    train_idx = np.arange(len(rows))
    test_idx = np.array([], dtype=int)
    unique_groups = np.unique(groups)
    if len(unique_groups) > 1:
        splitter = GroupShuffleSplit(n_splits=20, test_size=max(1 / len(unique_groups), .2), random_state=42)
        for candidate_train, candidate_test in splitter.split(X, y, groups):
            if len(np.unique(y[candidate_train])) > 1 and len(np.unique(y[candidate_test])):
                train_idx, test_idx = candidate_train, candidate_test
                holdout_day = ','.join(sorted(set(groups[test_idx])))
                break
    model = RandomForestClassifier(n_estimators=300, class_weight='balanced', random_state=42)
    model.fit(X[train_idx], y[train_idx])
    report = {}
    if test_idx.size:
        pred = model.predict(X[test_idx])
        precision, recall, f1, support = precision_recall_fscore_support(y[test_idx], pred, labels=classes, zero_division=0)
        report = {str(c): {'precision': float(p), 'recall': float(r), 'f1': float(f), 'support': int(s)} for c, p, r, f, s in zip(classes, precision, recall, f1, support)}
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    with open(MODEL_PATH, 'wb') as artifact:
        pickle.dump({'model': model, 'features': feature_names, 'extractor_version': FEATURE_VERSION}, artifact)
    metadata = {
        'trained_at': datetime.now(timezone.utc).isoformat(), 'row_count': len(rows),
        'class_counts': {str(c): int(n) for c, n in zip(classes, counts)},
        'held_out_day': holdout_day, 'validation_accuracy': float(accuracy_score(y[test_idx], model.predict(X[test_idx]))) if test_idx.size else None,
        'per_class': report, 'hazard_recall': {name: report.get(name, {}).get('recall') for name in ('natural_rockfall', 'block_removal')},
        'evaluation_note': 'Validation is grouped by file day.' if test_idx.size else 'No multi-day holdout available; metrics are omitted.',
    }
    with open(METADATA_PATH, 'w', encoding='utf-8') as output:
        json.dump(metadata, output, indent=2)
    return metadata


def suggest_label(features):
    if not os.path.exists(MODEL_PATH):
        return None
    try:
        with open(MODEL_PATH, 'rb') as artifact:
            bundle = pickle.load(artifact)
        vector = [[float(features.get(name, 0)) for name in bundle['features']]]
        probabilities = bundle['model'].predict_proba(vector)[0]
        index = int(np.argmax(probabilities))
        return {'category': str(bundle['model'].classes_[index]), 'confidence': float(probabilities[index])}
    except (OSError, ValueError, KeyError, pickle.UnpicklingError):
        return None
