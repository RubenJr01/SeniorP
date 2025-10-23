import { Link, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Form from "../components/Form";
import api from "../api";
import "../styles/Auth.css";

function Register() {
  const location = useLocation();
  const [inviteToken, setInviteToken] = useState("");
  const [inviteInfo, setInviteInfo] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("invite");
    if (!token) {
      setInviteToken("");
      setInviteInfo(null);
      setInviteError("");
      setInviteLoading(false);
      return;
    }

    setInviteToken(token);
    setInviteLoading(true);
    setInviteError("");

    api
      .get(`/api/invitations/lookup/${token}/`)
      .then(({ data }) => {
        setInviteInfo(data);
      })
      .catch((error) => {
        let message = "Invitation lookup failed.";
        if (error.response?.data?.detail) {
          message = error.response.data.detail;
        } else if (error.message) {
          message = error.message;
        }
        setInviteInfo(null);
        setInviteError(message);
      })
      .finally(() => {
        setInviteLoading(false);
      });
  }, [location.search]);

  const inviteStatus = useMemo(() => {
    if (inviteLoading) {
      return { type: "info", text: "Validating your invitation..." };
    }
    if (inviteError) {
      return { type: "error", text: inviteError };
    }
    if (!inviteInfo || !inviteToken) {
      return null;
    }
    if (inviteInfo.status === "accepted") {
      return { type: "error", text: "This invitation has already been used." };
    }
    if (inviteInfo.status === "expired") {
      return { type: "error", text: "This invitation has expired. Request a new invite." };
    }
    return {
      type: "info",
      text: `You're joining V-Cal as ${inviteInfo.email}, invited by ${inviteInfo.invited_by}.`,
    };
  }, [inviteInfo, inviteLoading, inviteError, inviteToken]);

  const formDisabled =
    Boolean(inviteStatus && inviteStatus.type === "error") || Boolean(inviteError);

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-hero">
          <div className="auth-brand">V-Cal</div>
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
            initialEmail={inviteInfo?.email || ""}
            inviteToken={inviteToken}
            emailLocked={Boolean(inviteToken)}
            disabled={formDisabled}
            footer={
              <span className="auth-switch">
                Already have access? <Link to="/login">Sign in</Link>
              </span>
            }
            submitLabel="Create account"
          />
          {inviteStatus && (
            <p
              className={`auth-muted${
                inviteStatus.type === "error" ? " auth-muted--warning" : ""
              }`}
            >
              {inviteStatus.text}
            </p>
          )}
          <p className="auth-muted">
            Tip: you can wire up Google Calendar credentials later from the dashboard.
          </p>
        </section>
      </div>
    </main>
  );
}

export default Register;
