import './CampaignTable.css';

function formatTimeRange(min, max) {
  return `Min ${min}s / Max ${max}s`;
}

function CampaignRow({ campaign, onEdit, onDelete, onToggle }) {
  const statusClass = campaign.enabled
    ? 'campaign-table__status campaign-table__status--active'
    : 'campaign-table__status campaign-table__status--paused';

  const channelList = Array.isArray(campaign.channels) ? campaign.channels : [];
  const hasChannels = channelList.length > 0;
  const processed = Number(campaign.processedCount) || 0;
  const total = Number(campaign.totalCount) || 0;
  const casesLabel = `${processed.toLocaleString('es-AR')} / ${total.toLocaleString('es-AR')}`;

  return (
    <tr>
      <td>{campaign.name}</td>
      <td>
        {hasChannels ? (
          <div className="campaign-table__channel-list">
            {channelList.map((channel) => {
              const status = (channel.status || '').toLowerCase();
              const isOnline = status === 'connected';
              const phone = channel.phoneNumber
                ? channel.phoneNumber.startsWith('+')
                  ? channel.phoneNumber
                  : `+${channel.phoneNumber}`
                : null;

              return (
                <span
                  key={channel.id}
                  className={`campaign-table__channel-tag${
                    isOnline ? ' campaign-table__channel-tag--online' : ''
                  }`}
                >
                  <span className="campaign-table__channel-tag-name">{channel.name}</span>
                  {phone && <span className="campaign-table__channel-tag-meta">{phone}</span>}
                </span>
              );
            })}
          </div>
        ) : (
          <span className="campaign-table__channel-empty">Sin canales asignados</span>
        )}
      </td>
      <td>{formatTimeRange(campaign.minDelay, campaign.maxDelay)}</td>
      <td>
        <span className={statusClass}>
          <span className="campaign-table__status-dot" />
          {campaign.enabled ? 'Encendida' : 'Detenida'}
        </span>
      </td>
      <td>{campaign.base}</td>
      <td>
        <span className="campaign-table__cases" title={`Procesados: ${processed.toLocaleString('es-AR')}, Total: ${total.toLocaleString('es-AR')}`}>
          {casesLabel}
        </span>
      </td>
      <td>
        <div className="campaign-table__actions">
          <button className="campaign-table__action" onClick={() => onEdit(campaign)}>
            Editar
          </button>
          <button
            className="campaign-table__action campaign-table__action--danger"
            onClick={() => onDelete(campaign)}
          >
            Eliminar
          </button>
        </div>
      </td>
      <td>
        <button
          className={`campaign-table__switch ${campaign.enabled ? 'campaign-table__switch--active' : ''}`}
          onClick={() => onToggle(campaign, !campaign.enabled)}
          aria-label={campaign.enabled ? 'Desactivar campaña' : 'Activar campaña'}
          aria-pressed={campaign.enabled}
          type="button"
        />
      </td>
    </tr>
  );
}

export default function CampaignTable({ campaigns, onEdit, onDelete, onToggle }) {
  return (
    <div className="campaign-table__wrapper">
      <table className="campaign-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Canal</th>
            <th>Tiempo de envío</th>
            <th>Estado</th>
            <th>Base</th>
            <th>Casos (Procesados / Total)</th>
            <th>Acciones</th>
            <th>Controles</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.length === 0 ? (
            <tr>
              <td className="campaign-table__empty" colSpan={8}>
                Aún no hay campañas creadas.
              </td>
            </tr>
          ) : (
            campaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggle={onToggle}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
