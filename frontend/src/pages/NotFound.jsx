import { Link } from "react-router-dom";
import "../styles/Auth.css";

function NotFound() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Lost in flight</h1>
        <p>This page does not exist or has been reassigned.</p>
        <Link className="auth-link-button" to="/">
          Return to home
        </Link>
        <p className="auth-muted">
          Need access to something else? Head to your dashboard once you are signed in.
        </p>
      </section>
    </main>
  );
}

export default NotFound;
