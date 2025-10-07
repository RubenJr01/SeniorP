# Django + React (Vite) Project

This repo contains a Django REST API backend and a React (Vite) frontend.

## Prerequisites
- Python 3.11+ (or compatible with your environment)
- Node.js 18+ (LTS recommended)
- npm (bundled with Node)

## Backend (Django)
1. Create/activate a virtual environment
   - Windows PowerShell:
     - `python -m venv env`
     - `.\env\Scripts\activate`
2. Install dependencies
   - `pip install -r requirements.txt`
3. Apply migrations
   - `cd backend`
   - `python manage.py migrate`
4. Create a superuser (optional)
   - `python manage.py createsuperuser`
5. Run the server
   - `python manage.py runserver`

The API will be available at `http://127.0.0.1:8000/`.

## Frontend (Vite + React)
1. Install packages
   - `cd frontend`
   - `npm install`
2. Configure environment
   - Copy `.env.example` to `.env` and adjust values as needed:
     - `VITE_API_URL=http://127.0.0.1:8000`
3. Start the dev server
   - `npm run dev`

Frontend will run at `http://localhost:5173/` and proxy requests to your API using `VITE_API_URL`.

## Authentication Notes
- The frontend expects JWT tokens from the Django backend (`/api/token/`, `/api/token/refresh/`).
- Protected routes in the frontend use the stored access/refresh tokens.

## Environment & Secrets
- Never commit real secrets. `.env` files are ignored by `.gitignore`.
- Use the provided `frontend/.env.example` as a template.

## Common Tasks
- Run tests (if configured): `pytest` or `python manage.py test`
- Lint (frontend): `npm run lint`

## Troubleshooting
- CORS: Ensure `corsheaders` is installed and middleware is configured high in the list. Allow the Vite origin (`http://127.0.0.1:5173` / `http://localhost:5173`).
- Migrations: If migrations conflict, run `python manage.py makemigrations --merge` or remove the duplicate migration and re-run migrations.

