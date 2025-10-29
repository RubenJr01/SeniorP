import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import Navigation from "../components/Navigation";
import "../styles/EmailParser.css";

export default function EmailParser() {
  const navigate = useNavigate();
  const [emailText, setEmailText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleParse = async (e) => {
    e.preventDefault();

    if (!emailText.trim()) {
      setError("Please paste email content");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await api.post("/api/events/parse-email/", {
        email_text: emailText,
      });

      setResult(response.data);

      // Redirect to calendar after 2 seconds
      setTimeout(() => {
        navigate("/calendar");
      }, 2000);

    } catch (err) {
      console.error("Parse error:", err);
      setError(
        err.response?.data?.error ||
        "Failed to parse email. Please check the format and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setEmailText("");
    setError("");
    setResult(null);
  };

  const exampleEmail = `Subject: Team Meeting Tomorrow

Hi team,

Let's schedule a project review meeting for tomorrow, January 15th at 3:00 PM.
We'll meet in Conference Room B and discuss the final deliverables.
Should take about 2 hours.

Please confirm your attendance.

Best,
Professor`;

  const loadExample = () => {
    setEmailText(exampleEmail);
    setError("");
    setResult(null);
  };

  return (
    <>
      <Navigation />
      <div className="email-parser-container">
        <div className="email-parser-header">
          <h1>📧 Parse Email to Event</h1>
          <p className="email-parser-description">
            Paste an email containing event details below, and our AI will automatically
            extract the date, time, and other information to create a calendar event.
          </p>
        </div>

        <form onSubmit={handleParse} className="email-parser-form">
          <div className="email-parser-textarea-container">
            <label htmlFor="emailText" className="email-parser-label">
              Email Content
            </label>
            <textarea
              id="emailText"
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              placeholder="Paste email here...

Example:
Subject: Team Meeting Tomorrow
Hi team, let's meet tomorrow at 2pm for our project discussion..."
              rows={15}
              className="email-parser-textarea"
              disabled={loading}
            />
          </div>

          <div className="email-parser-actions">
            <button
              type="button"
              onClick={loadExample}
              className="email-parser-button email-parser-button-secondary"
              disabled={loading}
            >
              Load Example
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="email-parser-button email-parser-button-secondary"
              disabled={loading || !emailText}
            >
              Clear
            </button>
            <button
              type="submit"
              className="email-parser-button email-parser-button-primary"
              disabled={loading || !emailText.trim()}
            >
              {loading ? "🤖 Parsing..." : "🤖 Parse & Create Event"}
            </button>
          </div>
        </form>

        {error && (
          <div className="email-parser-message email-parser-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div className="email-parser-message email-parser-success">
            <strong>✅ Success!</strong> Event created: <em>{result.event.title}</em>
            <br />
            <small>Redirecting to calendar...</small>
          </div>
        )}

        <div className="email-parser-help">
          <h3>💡 Tips</h3>
          <ul>
            <li>Include the subject line for better title extraction</li>
            <li>Mention specific dates and times (e.g., "tomorrow at 3pm", "January 15th at 2:00 PM")</li>
            <li>Include duration if known (e.g., "2 hour meeting", "30 minute call")</li>
            <li>Works with forwarded emails, calendar invites, and casual messages</li>
          </ul>
        </div>
      </div>
    </>
  );
}
