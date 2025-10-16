import { Link } from "react-router-dom";
import Form from "../components/Form";
import "../styles/Auth.css";

function Login() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Form
          route="/api/token/"
          method="login"
          title="Welcome back"
          footer={
            <span className="auth-switch">
              New here? <Link to="/register">Create an account</Link>
            </span>
          }
        />
      </section>
    </main>
  );
}

export default Login;
