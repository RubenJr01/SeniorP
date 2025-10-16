import { Link } from "react-router-dom";
import Form from "../components/Form";
import "../styles/Auth.css";

function Register() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Form
          route="/api/user/register/"
          method="register"
          title="Create your account"
          subtitle="Join SeniorP and organize sorties with secure, streamlined tooling."
          footer={
            <span className="auth-switch">
              Already have access? <Link to="/login">Sign in</Link>
            </span>
          }
          submitLabel="Create account"
        />
        <p className="auth-muted">
          Once your account is ready, you can enable Google 2FA from the landing page.
        </p>
      </section>
    </main>
  );
}

export default Register;
