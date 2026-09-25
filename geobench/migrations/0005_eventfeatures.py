from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('geobench', '0004_anomalylabel_user_eventlabel_user_filebatch_user_and_more')]
    operations = [
        migrations.CreateModel(
            name='EventFeatures',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('values', models.JSONField()),
                ('extractor_version', models.CharField(max_length=32)),
                ('created_at', models.DateTimeField(auto_now=True)),
                ('anomaly_label', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='features', to='geobench.anomalylabel')),
            ],
        ),
    ]
