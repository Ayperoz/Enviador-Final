import { useCallback, useEffect, useState } from 'react';
import {
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  updateCampaignEnabled
} from '../api/campaigns.js';
import { fetchChannels } from '../api/channels.js';
import CampaignTable from '../components/campaigns/CampaignTable.jsx';
import CampaignFormModal from '../components/campaigns/CampaignFormModal.jsx';
import './CampaignsPage.css';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);

  const loadCampaigns = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) {
        setLoading(true);
      }
      const data = await fetchCampaigns();
      setCampaigns(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar las campañas.');
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, []);

  const loadChannels = useCallback(async () => {
    try {
      const data = await fetchChannels();
      setChannels(data);
    } catch (err) {
      console.error(err);
      setError((prev) => prev ?? 'No se pudieron cargar los canales disponibles.');
    }
  }, []);

  useEffect(() => {
    loadCampaigns(true);
    loadChannels();

    const interval = setInterval(() => {
      loadCampaigns(false);
    }, 8000);

    return () => clearInterval(interval);
  }, [loadCampaigns, loadChannels]);

  useEffect(() => {
    if (isFormOpen) {
      loadChannels();
    }
  }, [isFormOpen, loadChannels]);

  const handleCreate = () => {
    setEditingCampaign(null);
    setIsFormOpen(true);
  };

  const handleEdit = (campaign) => {
    setEditingCampaign(campaign);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingCampaign(null);
  };

  const handleSubmit = async (values) => {
    try {
      if (editingCampaign) {
        const updated = await updateCampaign(editingCampaign.id, values);
        setCampaigns((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await createCampaign(values);
        setCampaigns((prev) => [created, ...prev]);
      }
      await loadCampaigns(false);
      closeForm();
    } catch (err) {
      console.error(err);
      const message = err.response?.data?.message || 'No se pudo guardar la campaña.';
      alert(message);
    }
  };

  const handleDelete = async (campaign) => {
    if (!window.confirm(`¿Eliminar la campaña "${campaign.name}"?`)) {
      return;
    }
    try {
      await deleteCampaign(campaign.id);
      setCampaigns((prev) => prev.filter((item) => item.id !== campaign.id));
    } catch (err) {
      console.error(err);
      alert('No se pudo eliminar la campaña.');
    }
  };

  const handleToggle = async (campaign, nextState) => {
    try {
      const updated = await updateCampaignEnabled(campaign.id, nextState);
      setCampaigns((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      console.error(err);
      alert('No se pudo actualizar el estado de la campaña.');
    }
  };

  return (
    <div className="campaigns-page">
      <div className="campaigns-page__header">
        <div>
          <h1>Campañas</h1>
          <p>Gestiona las campañas de envío masivo y sus horarios de ejecución.</p>
        </div>
        <button className="campaigns-page__button" onClick={handleCreate}>
          Nueva Campaña
        </button>
      </div>

      {error && <div className="campaigns-page__error">{error}</div>}

      {loading ? (
        <div className="campaigns-page__loading">Cargando campañas...</div>
      ) : (
        <CampaignTable
          campaigns={campaigns}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggle={handleToggle}
        />
      )}

      {isFormOpen && (
        <CampaignFormModal
          initialValues={editingCampaign}
          channels={channels}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
