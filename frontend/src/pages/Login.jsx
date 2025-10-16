import { Link } from "react-router-dom";
import Form from "../components/Form";
import "../styles/Auth.css";

function Login() {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-hero">
          <div className="auth-brand">SeniorP</div>
          <h2>Focus on the flight deck, not admin screens.</h2>
          <p>
            Sign back in to coordinate missions, manage sorties, and keep every crew aligned with
            the same trusted timeline.
          </p>
          <ul className="auth-hero-list">
            <li>Calendar awareness that updates in real time.</li>
            <li>Secure JWT sessions hardened for operational use.</li>
            <li>Single mission board for pilots, schedulers, and support.</li>
          </ul>
        </section>
        <section className="auth-card">
          <Form
            route="/api/token/"
            method="login"
            title="Welcome back"
            subtitle="Enter your credentials to continue planning missions."
            footer={
              <span className="auth-switch">
                New here? <Link to="/register">Create an account</Link>
              </span>
            }
          />
        </section>
      </div>
    </main>
  );
}

export default Login;
