from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0004_googleaccount_event_google_etag_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="recurrence_count",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="event",
            name="recurrence_end_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="event",
            name="recurrence_frequency",
            field=models.CharField(
                choices=[
                    ("none", "Does not repeat"),
                    ("daily", "Daily"),
                    ("weekly", "Weekly"),
                    ("monthly", "Monthly"),
                    ("yearly", "Yearly"),
                ],
                default="none",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="event",
            name="recurrence_interval",
            field=models.PositiveSmallIntegerField(default=1),
        ),
    ]
