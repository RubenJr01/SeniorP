import { useNavigate } from "react-router-dom";
import "../styles/Landing.css";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <main className="landing">
      <section className="landing-card">
        <h1>Welcome to SeniorP</h1>
        <p className="landing-subtitle">
          Manage missions, stay in sync, and secure your account with multi-factor options.
        </p>
        <div className="landing-actions">
          <button
            type="button"
            className="landing-primary"
            onClick={() => navigate("/login")}
          >
            Sign in
          </button>
          <button
            type="button"
            className="landing-secondary"
            onClick={() => navigate("/register")}
          >
            Create account
          </button>
        </div>
      </section>
    </main>
  );
}
