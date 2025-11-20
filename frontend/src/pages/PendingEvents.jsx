import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import Navigation from "../components/Navigation";
import styled from "styled-components";

const Container = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
`;

const Content = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 2rem;
  color: white;

  h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
  }

  p {
    font-size: 1.1rem;
    opacity: 0.95;
  }
`;

const EmptyState = styled.div`
  background: white;
  border-radius: 12px;
  padding: 3rem;
  text-align: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  h2 {
    color: #4a5568;
    margin-bottom: 1rem;
  }

  p {
    color: #718096;
    font-size: 1.1rem;
  }
`;

const EmailCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
  }
`;

const EmailHeader = styled.div`
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 1rem;
  margin-bottom: 1rem;

  h3 {
    color: #2d3748;
    font-size: 1.3rem;
    margin-bottom: 0.5rem;
  }

  .meta {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    font-size: 0.9rem;
    color: #718096;

    span {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
  }
`;

const EventDetails = styled.div`
  background: #f7fafc;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;

  .detail-row {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 1rem;
    margin-bottom: 0.75rem;
    font-size: 0.95rem;

    &:last-child {
      margin-bottom: 0;
    }

    .label {
      font-weight: 600;
      color: #4a5568;
    }

    .value {
      color: #2d3748;

      &.empty {
        color: #a0aec0;
        font-style: italic;
      }
    }
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
`;

const Button = styled.button`
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.primary {
    background: #48bb78;
    color: white;

    &:hover:not(:disabled) {
      background: #38a169;
    }
  }

  &.secondary {
    background: #4299e1;
    color: white;

    &:hover:not(:disabled) {
      background: #3182ce;
    }
  }

  &.danger {
    background: #f56565;
    color: white;

    &:hover:not(:disabled) {
      background: #e53e3e;
    }
  }

  &.outline {
    background: transparent;
    border: 2px solid #cbd5e0;
    color: #4a5568;

    &:hover:not(:disabled) {
      border-color: #a0aec0;
      background: #f7fafc;
    }
  }
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3rem;
  color: white;
  font-size: 1.2rem;
`;

const ErrorMessage = styled.div`
  background: #fff5f5;
  border: 1px solid #fc8181;
  border-radius: 8px;
  padding: 1rem;
  color: #c53030;
  margin-bottom: 1rem;
`;

const SuccessMessage = styled.div`
  background: #f0fff4;
  border: 1px solid #68d391;
  border-radius: 8px;
  padding: 1rem;
  color: #22543d;
  margin-bottom: 1rem;
`;

const ToggleSection = styled.div`
  margin-top: 1rem;
  border-top: 1px solid #e2e8f0;
  padding-top: 1rem;
`;

const ToggleButton = styled.button`
  background: transparent;
  border: none;
  color: #4299e1;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  padding: 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    color: #3182ce;
  }
`;

const EmailBody = styled.pre`
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 1rem;
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #4a5568;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 300px;
  overflow-y: auto;
`;

export default function PendingEvents() {
  const navigate = useNavigate();
  const [parsedEmails, setParsedEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [expandedEmailId, setExpandedEmailId] = useState(null);

  useEffect(() => {
    fetchParsedEmails();
  }, []);

  const fetchParsedEmails = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get("/api/parsed-emails/?status=pending");
      setParsedEmails(response.data);
    } catch (err) {
      console.error("Failed to fetch parsed emails:", err);
      setError("Failed to load pending events. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (emailId) => {
    try {
      setProcessingId(emailId);
      setError("");
      setSuccess("");

      const response = await api.post(`/api/parsed-emails/${emailId}/approve/`);

      setSuccess(`Event "${response.data.event.title}" created successfully!`);

      // Remove from list
      setParsedEmails(parsedEmails.filter(email => email.id !== emailId));

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Failed to approve:", err);
      setError(err.response?.data?.detail || "Failed to create event. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (emailId) => {
    if (!window.confirm("Are you sure you want to reject this event suggestion?")) {
      return;
    }

    try {
      setProcessingId(emailId);
      setError("");
      setSuccess("");

      await api.post(`/api/parsed-emails/${emailId}/reject/`);

      setSuccess("Email suggestion rejected.");

      // Remove from list
      setParsedEmails(parsedEmails.filter(email => email.id !== emailId));

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Failed to reject:", err);
      setError("Failed to reject suggestion. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const toggleEmailBody = (emailId) => {
    setExpandedEmailId(expandedEmailId === emailId ? null : emailId);
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return "Not specified";
    try {
      const date = new Date(dateTimeStr);
      return date.toLocaleString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateTimeStr;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Not specified";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <>
        <Navigation />
        <Container>
          <LoadingSpinner>Loading pending events...</LoadingSpinner>
        </Container>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <Container>
        <Content>
          <Header>
            <h1>📬 Pending Event Suggestions</h1>
            <p>Review AI-parsed emails from your Gmail and approve them to add to your calendar</p>
          </Header>

          {error && <ErrorMessage>{error}</ErrorMessage>}
          {success && <SuccessMessage>{success}</SuccessMessage>}

          {parsedEmails.length === 0 ? (
            <EmptyState>
              <h2>✨ All caught up!</h2>
              <p>No pending event suggestions at the moment.</p>
              <p style={{ marginTop: "1rem", fontSize: "0.95rem" }}>
                When Gmail detects calendar-related emails, they'll appear here for your review.
              </p>
            </EmptyState>
          ) : (
            <>
              {parsedEmails.map((email) => {
                const eventData = email.parsed_data || {};
                const isExpanded = expandedEmailId === email.id;
                const isProcessing = processingId === email.id;

                return (
                  <EmailCard key={email.id}>
                    <EmailHeader>
                      <h3>{email.subject}</h3>
                      <div className="meta">
                        <span>
                          <strong>From:</strong> {email.sender || "Unknown"}
                        </span>
                        <span>
                          <strong>Received:</strong> {formatDate(email.parsed_at)}
                        </span>
                      </div>
                    </EmailHeader>

                    <EventDetails>
                      <div className="detail-row">
                        <div className="label">Event Title:</div>
                        <div className="value">{eventData.title || <span className="empty">Not detected</span>}</div>
                      </div>
                      <div className="detail-row">
                        <div className="label">Start Time:</div>
                        <div className="value">{formatDateTime(eventData.start)}</div>
                      </div>
                      <div className="detail-row">
                        <div className="label">End Time:</div>
                        <div className="value">{formatDateTime(eventData.end)}</div>
                      </div>
                      {eventData.location && (
                        <div className="detail-row">
                          <div className="label">Location:</div>
                          <div className="value">{eventData.location}</div>
                        </div>
                      )}
                      {eventData.all_day && (
                        <div className="detail-row">
                          <div className="label">All-Day Event:</div>
                          <div className="value">Yes</div>
                        </div>
                      )}
                      {eventData.recurrence_frequency && eventData.recurrence_frequency !== "none" && (
                        <div className="detail-row">
                          <div className="label">Recurrence:</div>
                          <div className="value">
                            {eventData.recurrence_frequency.charAt(0).toUpperCase() + eventData.recurrence_frequency.slice(1)}
                            {eventData.recurrence_interval > 1 && ` (every ${eventData.recurrence_interval})`}
                            {eventData.recurrence_count && ` - ${eventData.recurrence_count} times`}
                          </div>
                        </div>
                      )}
                      {eventData.attendees && eventData.attendees.length > 0 && (
                        <div className="detail-row">
                          <div className="label">Attendees:</div>
                          <div className="value">{eventData.attendees.join(", ")}</div>
                        </div>
                      )}
                    </EventDetails>

                    <ToggleSection>
                      <ToggleButton onClick={() => toggleEmailBody(email.id)}>
                        {isExpanded ? "▼" : "▶"} {isExpanded ? "Hide" : "Show"} Original Email
                      </ToggleButton>
                      {isExpanded && <EmailBody>{email.email_body}</EmailBody>}
                    </ToggleSection>

                    <ActionButtons style={{ marginTop: "1.5rem" }}>
                      <Button
                        className="primary"
                        onClick={() => handleApprove(email.id)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? "Processing..." : "✓ Approve & Create Event"}
                      </Button>
                      <Button
                        className="danger"
                        onClick={() => handleReject(email.id)}
                        disabled={isProcessing}
                      >
                        ✕ Reject
                      </Button>
                      <Button
                        className="outline"
                        onClick={() => navigate("/calendar")}
                        disabled={isProcessing}
                      >
                        View Calendar
                      </Button>
                    </ActionButtons>
                  </EmailCard>
                );
              })}
            </>
          )}
        </Content>
      </Container>
    </>
  );
}
