import { Link } from "react-router-dom";
import Form from "../components/Form";
import "../styles/Auth.css";

function Register() {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-hero">
          <div className="auth-brand">SeniorP</div>
          <h2>Spin up your operations hub in minutes.</h2>
          <p>
            Create an account to capture sorties, coordinate teams, and unlock Google Calendar
            synchronization across the squadron.
          </p>
          <ul className="auth-hero-list">
            <li>Streamline scheduling and reduce double-booking.</li>
            <li>Enable secure access with ready-to-extend auth flows.</li>
            <li>Share mission context instantly with the entire crew.</li>
          </ul>
        </section>
        <section className="auth-card">
          <Form
            route="/api/user/register/"
            method="register"
            title="Create your account"
            subtitle="We just need a username and password to get started."
            footer={
              <span className="auth-switch">
                Already have access? <Link to="/login">Sign in</Link>
              </span>
            }
            submitLabel="Create account"
          />
          <p className="auth-muted">
            Tip: you can wire up Google Calendar credentials later from the dashboard.
          </p>
        </section>
      </div>
    </main>
  );
}

export default Register;
