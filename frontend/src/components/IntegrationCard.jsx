import "../styles/Dashboard.css";

function IntegrationCard({
  title,
  statusLabel,
  statusTone,
  loading,
  loadingMessage,
  connected,
  connectedDescription,
  disconnectedDescription,
  onConnect,
  onDisconnect,
  working,
  connectLabel,
  disconnectLabel,
}) {
  return (
    <article className="dashboard-stat">
      <span className="dashboard-stat-label">{title}</span>
      <span className={`dashboard-chip dashboard-chip--${statusTone}`}>{statusLabel}</span>
      {loading ? (
        <p className="dashboard-muted">{loadingMessage}</p>
      ) : (
        <>
          <p className="dashboard-paragraph">
            {connected ? connectedDescription : disconnectedDescription}
          </p>
          {connected ? (
            <div className="dashboard-button-row">
              <button
                type="button"
                className="dashboard-button dashboard-button--ghost"
                onClick={onDisconnect}
                disabled={working}
              >
                {disconnectLabel}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="dashboard-button"
              onClick={onConnect}
              disabled={working}
            >
              {connectLabel}
            </button>
          )}
        </>
      )}
    </article>
  );
}

export default IntegrationCard;

