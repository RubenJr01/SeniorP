# Project Review

## Key Issues

1. **Production secrets & CORS configuration are committed to source control**  \
   `backend/backend/settings.py` keeps `SECRET_KEY`, enables `DEBUG`, allows every host, and sets `CORS_ALLOW_ALL_ORIGINS = True`. Shipping those defaults makes it trivial for an attacker to reuse leaked credentials or abuse your API when the app is deployed. Pull these values from environment variables and restrict allowed origins/hosts for non-development environments. 【F:backend/backend/settings.py†L27-L34】【F:backend/backend/settings.py†L148-L154】

2. **Missing validation that event end times follow start times**  \
   Neither the serializer nor the model prevents `end` timestamps that precede `start`, so a client can persist nonsensical events and break listings/order logic. Add a `validate` method (or model `clean`) to enforce `end >= start` before saving. 【F:backend/api/serializers.py†L17-L31】【F:backend/api/models.py†L4-L16】

3. **Detail endpoint is misnamed and only suited for deletes**  \
   The detail route is registered at `/api/event/delete/<pk>/`, yet it is backed by `RetrieveUpdateDestroyAPIView`. That path discourages reuse for read/update operations and leaks HTTP verbs into the URL. Rename it to something neutral like `/api/events/<pk>/` and update the client accordingly. 【F:backend/api/urls.py†L4-L7】【F:frontend/src/pages/Dashboard.jsx†L81-L158】

## Additional Suggestions

- Consider adding API tests (e.g., around authentication and event CRUD) so regressions surface quickly. 【F:backend/api/tests.py†L1-L4】
- Surface friendlier error messages in the React forms; currently a failed login/register just triggers a generic `alert(error)`. 【F:frontend/src/components/Form.jsx†L23-L44】
