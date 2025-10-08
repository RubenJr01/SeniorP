FROM python:3.11-slim AS runtime

# Ensure Python writes output straight to the terminal
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install only the packages we need to run the application
COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Make sure the entrypoint script is executable inside the container
RUN chmod +x entrypoint.sh

# Create a dedicated non-root user so the app does not run as root
RUN addgroup --system appuser \
    && adduser --system --ingroup appuser --home /app appuser \
    && mkdir -p /app/staticfiles \
    && chown -R appuser:appuser /app

USER appuser

# Run database migrations and collect static assets before starting Gunicorn
ENTRYPOINT ["./entrypoint.sh"]
CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000"]
