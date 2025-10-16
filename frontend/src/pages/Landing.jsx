import { useNavigate } from "react-router-dom";
import "../styles/Landing.css";

export default function Landing() {
  const navigate = useNavigate();

  return (
    <main className="landing">
      <div className="landing-background" aria-hidden="true" />
      <div className="landing-shell">
        <header className="landing-header">
          <div className="landing-logo">V-Cal</div>
          <div className="landing-header-actions">
            <button
              type="button"
              className="landing-link"
              onClick={() => navigate("/login")}
            >
              Log in
            </button>
            <button
              type="button"
              className="landing-link landing-link--primary"
              onClick={() => navigate("/register")}
            >
              Get started
            </button>
          </div>
        </header>

        <section className="landing-hero">
          <div className="landing-copy">
            <span className="landing-badge">Mission ready toolkit</span>
            <h1>Coordinate sorties with clarity and confidence.</h1>
            <p>
              V-Cal keeps crews aligned with a focused mission board, instant Google Calendar
              sync, and guard rails that make onboarding secure.
            </p>
            <dl className="landing-metrics">
              <div>
                <dt>Two-way sync</dt>
                <dd>Bi-directional Google Calendar updates.</dd>
              </div>
              <div>
                <dt>Task clarity</dt>
                <dd>Create, assign, and deconflict sorties in seconds.</dd>
              </div>
              <div>
                <dt>Ready in minutes</dt>
                <dd>Local setup with protected auth flows.</dd>
              </div>
            </dl>
          </div>

          <div className="landing-preview">
            <div className="landing-preview-panel">
              <header className="landing-preview-header">
                <span>Operations board</span>
                <span>Today</span>
              </header>
              <ul className="landing-preview-list">
                <li>
                  <span className="landing-preview-time">07:30</span>
                  <div>
                    <strong>Pre-flight briefing</strong>
                    <p>Hangar 3 - Duty crew</p>
                  </div>
                  <span className="landing-preview-tag">Local</span>
                </li>
                <li>
                  <span className="landing-preview-time">09:15</span>
                  <div>
                    <strong>NAV drill sortie</strong>
                    <p>Runway 21 - Capt. Mills</p>
                  </div>
                  <span className="landing-preview-tag landing-preview-tag--sync">
                    Synced
                  </span>
                </li>
                <li>
                  <span className="landing-preview-time">13:40</span>
                  <div>
                    <strong>Night qualifiers</strong>
                    <p>Range 5 - Crew Blue</p>
                  </div>
                  <span className="landing-preview-tag landing-preview-tag--google">
                    Google
                  </span>
                </li>
              </ul>
            </div>
            <div className="landing-preview-footer">
              <div>
                <span className="landing-preview-count">24</span>
                <p>scheduled events this month</p>
              </div>
              <div>
                <span className="landing-preview-count">3</span>
                <p>pending sync updates</p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-feature-grid">
          <article className="landing-feature">
            <span className="landing-feature-icon">01</span>
            <h3>Modern mission board</h3>
            <p>Streamlined views keep pilots focused on the next sortie without noise.</p>
          </article>
          <article className="landing-feature">
            <span className="landing-feature-icon">02</span>
            <h3>Secure access</h3>
            <p>JWT auth with optional second factor so the right crew sees the plan.</p>
          </article>
          <article className="landing-feature">
            <span className="landing-feature-icon">03</span>
            <h3>Actionable sync</h3>
            <p>Google Calendar integration brings real timeline awareness to every decision.</p>
          </article>
        </section>
      </div>
    </main>
  );
}
