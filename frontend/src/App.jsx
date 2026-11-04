import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Camera,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ImagePlus,
  Maximize2,
  MapPin,
  Moon,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import './App.css';

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8000'
).replace(/\/+$/, '');
const TODAY = new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 24;
const EMPTY_ITEM = {
  title: '',
  description: '',
  status: 'lost',
  category: '',
  location: '',
  date_reported: TODAY,
};
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The captured photo could not be processed.'));
    }, 'image/jpeg', quality);
  });
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = sessionStorage.getItem('campusFindsAccessToken');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || `Request failed (${response.status})`);
  }
  return data;
}

function App() {
  const [activeTab, setActiveTab] = useState('browse');
  const [theme, setTheme] = useState(
    () => localStorage.getItem('campusFindsTheme') || 'light',
  );
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [hasMoreItems, setHasMoreItems] = useState(false);
  const [pageOffset, setPageOffset] = useState(0);
  const [filters, setFilters] = useState({
    q: '',
    status: 'all',
    category: '',
    location: '',
    date_from: '',
    date_to: '',
  });
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('campusFindsUser') || 'null');
    } catch {
      sessionStorage.removeItem('campusFindsUser');
      return null;
    }
  });
  const [accountMode, setAccountMode] = useState('login');
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registration, setRegistration] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const photoPreviewUrl = useRef('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const cameraVideoRef = useRef(null);
  const cameraCloseRef = useRef(null);
  const [viewingImage, setViewingImage] = useState(null);
  const imageViewerCloseRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [claimingItem, setClaimingItem] = useState(null);
  const [claimProof, setClaimProof] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [adminItems, setAdminItems] = useState([]);
  const [adminClaims, setAdminClaims] = useState([]);
  const [adminLoaded, setAdminLoaded] = useState(false);
  const [adminPhotoUrls, setAdminPhotoUrls] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const objectUrls = useRef([]);
  const itemsRequestId = useRef(0);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  useEffect(() => {
    localStorage.setItem('campusFindsTheme', theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    if (photoPreviewUrl.current) URL.revokeObjectURL(photoPreviewUrl.current);
  }, []);

  useEffect(() => {
    if (!viewingImage) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setViewingImage(null);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    imageViewerCloseRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewingImage]);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let active = true;
    let stream;
    const videoElement = cameraVideoRef.current;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setCameraOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    cameraCloseRef.current?.focus();

    async function startCamera() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access requires a secure page (HTTPS or localhost) and a browser that supports camera capture. Close this dialog to choose an existing photo instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (!videoElement) {
          stream.getTracks().forEach((track) => track.stop());
          stream = null;
          setCameraError('The camera preview could not be opened. Close this dialog and try again.');
          return;
        }
        videoElement.srcObject = stream;
        await videoElement.play();
        if (active) setCameraReady(true);
      } catch (cameraRequestError) {
        if (!active) return;
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        if (videoElement) videoElement.srcObject = null;
        if (cameraRequestError.name === 'NotAllowedError' || cameraRequestError.name === 'SecurityError') {
          setCameraError('Camera permission was denied. Allow camera access in your browser settings, then close this dialog to choose an existing photo.');
        } else if (cameraRequestError.name === 'NotFoundError' || cameraRequestError.name === 'OverconstrainedError') {
          setCameraError('No usable camera was found. Close this dialog to choose an existing photo instead.');
        } else if (cameraRequestError.name === 'NotReadableError') {
          setCameraError('The camera is unavailable or being used by another app. Close other camera apps and try again.');
        } else {
          setCameraError(`Could not start the camera: ${cameraRequestError.message || 'An unknown camera error occurred.'}`);
        }
      }
    }

    startCamera();
    return () => {
      active = false;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) videoElement.srcObject = null;
    };
  }, [cameraOpen]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE + 1));
    params.set('skip', String(pageOffset));
    Object.entries(filters).forEach(([key, value]) => {
      if (value && !(key === 'status' && value === 'all')) {
        params.set(key, value);
      }
    });
    const requestId = ++itemsRequestId.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingItems(true);
      try {
        const page = await request(`/items/?${params.toString()}`, {
          signal: controller.signal,
        });
        if (requestId === itemsRequestId.current) {
          setItems(page.slice(0, PAGE_SIZE));
          setHasMoreItems(page.length > PAGE_SIZE);
          setError('');
        }
      } catch (requestError) {
        if (requestError.name !== 'AbortError' && requestId === itemsRequestId.current) {
          setError(requestError.message);
        }
      } finally {
        if (requestId === itemsRequestId.current) {
          setLoadingItems(false);
        }
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (requestId === itemsRequestId.current) {
        itemsRequestId.current += 1;
      }
    };
  }, [filters, pageOffset]);

  useEffect(() => {
    if (!user) return;
    request(`/users/${user.id}/notifications/`)
      .then(setNotifications)
      .catch((requestError) => setError(requestError.message));
  }, [user, activeTab]);

  function changeFilter(event) {
    setPageOffset(0);
    setItems([]);
    setHasMoreItems(false);
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function choosePhoto(file) {
    if (photoPreviewUrl.current) URL.revokeObjectURL(photoPreviewUrl.current);
    photoPreviewUrl.current = file ? URL.createObjectURL(file) : '';
    setPhotoPreview(photoPreviewUrl.current);
    setPhoto(file);
  }

  function openCamera() {
    setCameraReady(false);
    setCameraError('');
    setCameraOpen(true);
  }

  async function capturePhoto() {
    const video = cameraVideoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError('The camera is not ready yet. Please wait a moment and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('This browser could not prepare the captured image. Close this dialog to choose an existing photo instead.');
      return;
    }
    let maxDimension = 1920;
    let quality = 0.9;
    let blob;
    try {
      while (maxDimension >= 320) {
        const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        blob = await canvasToBlob(canvas, quality);
        if (blob.size <= MAX_PHOTO_BYTES) break;
        if (quality > 0.55) quality -= 0.1;
        else {
          maxDimension = Math.round(maxDimension * 0.75);
          quality = 0.85;
        }
      }
    } catch (captureError) {
      setCameraError(`Could not capture the photo: ${captureError.message}`);
      return;
    }
    if (!blob || blob.size > MAX_PHOTO_BYTES) {
      setCameraError('The captured image is too large to upload. Please try again or choose a smaller photo.');
      return;
    }

    choosePhoto(new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    setCameraOpen(false);
  }

  function saveSession(session) {
    sessionStorage.setItem('campusFindsAccessToken', session.access_token);
    sessionStorage.setItem('campusFindsUser', JSON.stringify(session.user));
    setUser(session.user);
    setAccountMode('login');
  }

  async function handleRegister(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await request('/users/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registration),
      });
      saveSession(session);
      setRegistration({ name: '', email: '', phone: '', password: '' });
      setNotice(`Welcome, ${session.user.name}. Your account is ready.`);
      setActiveTab('browse');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData),
      });
      saveSession(session);
      setLoginData({ email: '', password: '' });
      setNotice(`Welcome back, ${session.user.name}.`);
      setActiveTab('browse');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    sessionStorage.removeItem('campusFindsAccessToken');
    sessionStorage.removeItem('campusFindsUser');
    setUser(null);
    setNotifications([]);
    setNotice('You have been signed out.');
  }

  async function handleReport(event) {
    event.preventDefault();
    if (!user) {
      setError('Create an account first so the report is linked to you.');
      setActiveTab('account');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const item = await request('/items/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemForm),
      });
      let photoUploadFailed = false;
      if (photo) {
        const formData = new FormData();
        formData.append('photo', photo);
        try {
          await request(`/items/${item.id}/photo`, {
            method: 'POST',
            body: formData,
          });
        } catch (photoError) {
          photoUploadFailed = true;
          setError(`Report #${item.id} was saved, but the photo was not uploaded: ${photoError.message}`);
        }
      }
      setItemForm({ ...EMPTY_ITEM, date_reported: TODAY });
      choosePhoto(null);
      if (!photoUploadFailed) {
        setNotice('Report submitted. It will appear publicly after admin verification.');
      }
      setActiveTab('browse');
      setPageOffset(0);
      setFilters((current) => ({ ...current, q: '', status: 'all' }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitClaim(itemId) {
    if (!user) {
      setError('Create an account before submitting a claim.');
      setActiveTab('account');
      return;
    }
    if (!claimProof.trim()) {
      setError('Add a short description that proves the item belongs to you.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request(`/items/${itemId}/claims/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof_description: claimProof.trim() }),
      });
      setClaimingItem(null);
      setClaimProof('');
      setNotice('Claim sent for admin review.');
      if (user) {
        setNotifications(await request(`/users/${user.id}/notifications/`));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function markRead(notificationId) {
    if (!user) return;
    try {
      await request(`/users/${user.id}/notifications/${notificationId}/read`, {
        method: 'PATCH',
      });
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, is_read: true }
            : notification,
        ),
      );
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function loadAdminQueue(event) {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const headers = { 'X-Admin-Key': adminKey };
      const [pendingItems, pendingClaims] = await Promise.all([
        request('/admin/items/', { headers }),
        request('/admin/claims/', { headers }),
      ]);
      const photoMap = {};
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
      await Promise.all(
        pendingItems
          .filter((item) => item.image_url)
          .map(async (item) => {
            const response = await fetch(`${API_BASE}/admin/items/${item.id}/photo`, {
              headers,
            });
            if (!response.ok) {
              throw new Error(`Could not load the photo for report #${item.id}.`);
            }
            const url = URL.createObjectURL(await response.blob());
            objectUrls.current.push(url);
            photoMap[item.id] = url;
          }),
      );
      setAdminItems(pendingItems);
      setAdminClaims(pendingClaims);
      setAdminPhotoUrls(photoMap);
      setAdminLoaded(true);
      setNotice('Admin review queue loaded.');
    } catch (requestError) {
      setAdminLoaded(false);
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function reviewItem(itemId, reviewStatus) {
    setBusy(true);
    setError('');
    try {
      await request(`/admin/items/${itemId}/verification`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({ status: reviewStatus }),
      });
      setNotice(`Report ${reviewStatus}.`);
      await loadAdminQueue();
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  async function reviewClaim(claimId, reviewStatus) {
    setBusy(true);
    setError('');
    try {
      await request(`/admin/claims/${claimId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({ status: reviewStatus }),
      });
      setNotice(`Claim ${reviewStatus}.`);
      await loadAdminQueue();
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  function navigate(tab) {
    setError('');
    setNotice('');
    setActiveTab(tab);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('browse')} aria-label="Go to browse">
          <span className="brand-mark"><Package size={22} /></span>
          <span><strong>Lost & Found</strong></span>
        </button>
        <nav className="desktop-nav" aria-label="Main navigation">
          <NavButton id="browse" active={activeTab} onClick={navigate} icon={<Search size={17} />} label="Browse" />
          <NavButton id="report" active={activeTab} onClick={navigate} icon={<Plus size={17} />} label="Report" />
          <NavButton id="alerts" active={activeTab} onClick={navigate} icon={<Bell size={17} />} label="Alerts" count={unreadCount} />
          <NavButton id="account" active={activeTab} onClick={navigate} icon={<UserRound size={17} />} label="Account" />
          <NavButton id="admin" active={activeTab} onClick={navigate} icon={<ShieldCheck size={17} />} label="Admin" />
        </nav>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="topbar-user">
            <span className="status-dot" />
            <span>{user ? user.name : 'Campus community'}</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <section className="welcome-row">
          <div>
            <p className="eyebrow">YOUR CAMPUS, CONNECTED</p>
            <h1>{activeTab === 'browse' ? 'Find what’s missing.' : tabTitle(activeTab)}</h1>
            <p className="subheading">
              A simple place to report, search and claim your lost belongings.
            </p>
          </div>
          {activeTab === 'browse' && (
            <button className="primary-button desktop-report" onClick={() => navigate('report')}>
              <Plus size={18} /> Report an item
            </button>
          )}
        </section>

        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}

        {activeTab === 'browse' && (
          <section aria-label="Browse verified items">
            <div className="search-panel">
              <label className="search-field">
                <Search size={19} />
                <span className="sr-only">Search item descriptions</span>
                <input
                  name="q"
                  placeholder="Search items, details or keywords"
                  value={filters.q}
                  onChange={changeFilter}
                />
              </label>
              <div className="filter-grid">
                <label>
                  <span>Type</span>
                  <select name="status" value={filters.status} onChange={changeFilter}>
                    <option value="all">Lost &amp; found</option>
                    <option value="found">Found items</option>
                    <option value="lost">Lost items</option>
                  </select>
                </label>
                <label>
                  <span>Category</span>
                  <input name="category" placeholder="e.g. Electronics" value={filters.category} onChange={changeFilter} />
                </label>
                <label>
                  <span>Location</span>
                  <input name="location" placeholder="Building or area" value={filters.location} onChange={changeFilter} />
                </label>
                <label>
                  <span>From date</span>
                  <input name="date_from" type="date" value={filters.date_from} onChange={changeFilter} />
                </label>
                <label>
                  <span>To date</span>
                  <input name="date_to" type="date" value={filters.date_to} onChange={changeFilter} />
                </label>
              </div>
            </div>

            <div className="section-heading">
              <div>
                <p className="eyebrow">COMMUNITY REPORTS</p>
                <h2>Recently verified</h2>
              </div>
              <span className="result-count">
                {items.length > 0
                  ? `Showing ${pageOffset + 1}–${pageOffset + items.length}`
                  : 'No reports'}
              </span>
            </div>

            {loadingItems ? (
              <div className="empty-state"><span className="loader" /> Loading reports…</div>
            ) : items.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon"><Search size={24} /></span>
                <h3>No matching reports yet</h3>
                <p>Try a different search or check back after new reports are verified.</p>
              </div>
            ) : (
              <div className="item-grid">
                {items.map((item) => (
                  <article className="item-card" key={item.id}>
                    {item.image_url ? (
                      <div className="item-photo-wrap">
                        <img className="item-photo" src={`${API_BASE}${item.image_url}`} alt={item.title} />
                        <button
                          className="image-expand-button"
                          type="button"
                          aria-label={`View ${item.title} image full screen`}
                          title="View image full screen"
                          onClick={() => setViewingImage({ src: `${API_BASE}${item.image_url}`, alt: item.title })}
                        >
                          <Maximize2 size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="item-photo photo-placeholder"><Package size={30} /></div>
                    )}
                    <div className="item-card-body">
                      <div className="item-tags">
                        <span className={`tag ${item.status}`}>{item.status}</span>
                        <span className="tag category-tag">{item.category}</span>
                        {item.is_resolved && <span className="tag claimed-tag">Claimed</span>}
                      </div>
                      <h3>{item.title}</h3>
                      <p className="item-description">{item.description}</p>
                      <div className="item-meta">
                        <span><MapPin size={15} />{item.location}</span>
                        <span><CalendarDays size={15} />{item.date_reported}</span>
                      </div>
                    </div>
                    <div className="item-card-footer">
                      <div className="reporter">
                        <span className="avatar">{(item.owner?.name || '?').slice(0, 1).toUpperCase()}</span>
                        <span><small>Reported by</small><strong>{item.owner?.name}</strong></span>
                      </div>
                      {item.owner?.phone && <a className="contact-link" href={`tel:${item.owner.phone}`}>Contact reporter</a>}
                      {item.status === 'found' && !item.is_resolved && item.user_id !== user?.id && (
                        <button
                          className="secondary-button claim-button"
                          onClick={() => {
                            setClaimingItem(claimingItem === item.id ? null : item.id);
                            setClaimProof('');
                          }}
                        >
                          Claim item
                        </button>
                      )}
                    </div>
                    {claimingItem === item.id && (
                      <div className="claim-form">
                        <label htmlFor={`proof-${item.id}`}>How can you prove it is yours?</label>
                        <textarea
                          id={`proof-${item.id}`}
                          rows="3"
                          value={claimProof}
                          onChange={(event) => setClaimProof(event.target.value)}
                          placeholder="Describe a distinctive detail only the owner would know."
                        />
                        <button className="primary-button full-width" disabled={busy} onClick={() => submitClaim(item.id)}>
                          Send claim for review
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
            {(pageOffset > 0 || hasMoreItems) && !loadingItems && (
              <nav className="pagination-controls" aria-label="Report pages">
                <button
                  className="secondary-button"
                  disabled={pageOffset === 0}
                  onClick={() => setPageOffset((offset) => Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </button>
                <span aria-live="polite">Page {Math.floor(pageOffset / PAGE_SIZE) + 1}</span>
                <button
                  className="secondary-button"
                  disabled={!hasMoreItems}
                  onClick={() => setPageOffset((offset) => offset + PAGE_SIZE)}
                >
                  Next
                </button>
              </nav>
            )}
          </section>
        )}

        {activeTab === 'report' && (
          <section className="form-card">
            {!user ? (
              <div className="empty-state">
                <UserRound size={28} />
                <h2>Create an account to report</h2>
                <p>Reports are connected to a contact so people can be reunited with their belongings.</p>
                <button className="primary-button" onClick={() => navigate('account')}>Continue to account</button>
              </div>
            ) : (
              <form className="form-layout" onSubmit={handleReport}>
                <div className="form-intro">
                  <span className="form-icon"><ImagePlus size={22} /></span>
                  <div><h2>Share a report</h2><p>Clear details help the right item find its owner.</p></div>
                </div>
                <div className="form-grid">
                  <label className="wide-field">Item name
                    <input required maxLength="150" value={itemForm.title} onChange={(event) => setItemForm({ ...itemForm, title: event.target.value })} placeholder="e.g. Blue water bottle" />
                  </label>
                  <label>Report type
                    <select value={itemForm.status} onChange={(event) => setItemForm({ ...itemForm, status: event.target.value })}>
                      <option value="lost">I lost this</option><option value="found">I found this</option>
                    </select>
                  </label>
                  <label>Category
                    <input required maxLength="50" value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })} placeholder="Keys, electronics…" />
                  </label>
                  <label>Location
                    <input required maxLength="150" value={itemForm.location} onChange={(event) => setItemForm({ ...itemForm, location: event.target.value })} placeholder="Where was it lost or found?" />
                  </label>
                  <label>Date
                    <input required type="date" value={itemForm.date_reported} onChange={(event) => setItemForm({ ...itemForm, date_reported: event.target.value })} />
                  </label>
                  <label className="wide-field">Description
                    <textarea required rows="4" value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} placeholder="Color, brand, distinguishing marks, or other identifying details." />
                  </label>
                  <div className="wide-field photo-field">
                    <span className="photo-field-label">Photo <span className="label-hint">Optional · JPEG, PNG or WebP · up to 5 MB</span></span>
                    <div className="photo-input-options">
                      <label className="photo-input-option"><span><ImagePlus size={17} /> Choose a photo</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0] || null)} />
                      </label>
                      <button className="photo-input-option camera-option" type="button" onClick={openCamera}>
                        <span><Camera size={17} /> Take a photo with camera</span>
                      </button>
                    </div>
                    <span className="label-hint">On phones, Take a photo opens the camera when supported.</span>
                  </div>
                </div>
                {photoPreview && <img className="upload-preview" src={photoPreview} alt="Selected item preview" />}
                <div className="form-note"><Clock3 size={16} /> Reports are reviewed by an administrator before they appear in search.</div>
                <button className="primary-button full-width" disabled={busy} type="submit">{busy ? 'Submitting…' : 'Submit report'}</button>
              </form>
            )}
          </section>
        )}

        {activeTab === 'alerts' && (
          <section className="notification-list">
            {!user ? (
              <div className="empty-state"><Bell size={28} /><h2>Your notifications</h2><p>Create an account to receive possible match alerts and claim updates.</p><button className="primary-button" onClick={() => navigate('account')}>Go to account</button></div>
            ) : notifications.length === 0 ? (
              <div className="empty-state"><span className="empty-icon"><Bell size={24} /></span><h2>You’re all caught up</h2><p>Possible matches and claim updates will show up here.</p></div>
            ) : notifications.map((notification) => (
              <article className={`notification-card ${notification.is_read ? '' : 'unread'}`} key={notification.id}>
                <span className="notification-icon">{notification.kind === 'match' ? <Search size={19} /> : <Bell size={19} />}</span>
                <div><p>{notification.message}</p><small>{new Date(notification.created_at).toLocaleString()}</small></div>
                {!notification.is_read && <button className="icon-button" aria-label="Mark as read" onClick={() => markRead(notification.id)}><Check size={18} /></button>}
              </article>
            ))}
          </section>
        )}

        {activeTab === 'account' && (
          <section className="form-card account-card">
            {user ? (
              <div className="account-summary">
                <span className="account-avatar"><UserRound size={28} /></span>
                <p className="eyebrow">YOUR ACCOUNT</p>
                <h2>{user.name}</h2>
                <p>{user.email}</p>
                <p>{user.phone}</p>
                <div className="form-note">You are signed in on this tab. Other users can sign in independently on their own devices or browser sessions.</div>
                <button className="secondary-button" onClick={signOut}>Sign out</button>
              </div>
            ) : (
              <div className="form-layout">
                <div className="form-intro"><span className="form-icon"><UserRound size={22} /></span><div><h2>{accountMode === 'login' ? 'Welcome back' : 'Join your campus'}</h2><p>{accountMode === 'login' ? 'Sign in to report items, submit claims and view alerts.' : 'Create an account to report items and receive updates.'}</p></div></div>
                <div className="account-mode-switch" role="tablist" aria-label="Account action">
                  <button type="button" className={accountMode === 'login' ? 'selected' : ''} onClick={() => setAccountMode('login')} role="tab" aria-selected={accountMode === 'login'}>Log in</button>
                  <button type="button" className={accountMode === 'register' ? 'selected' : ''} onClick={() => setAccountMode('register')} role="tab" aria-selected={accountMode === 'register'}>Create account</button>
                </div>
                {accountMode === 'login' ? (
                  <form className="form-layout" onSubmit={handleLogin}>
                    <label>Email address<input required type="email" value={loginData.email} onChange={(event) => setLoginData({ ...loginData, email: event.target.value })} autoComplete="email" /></label>
                    <label>Password<input required type="password" minLength="8" value={loginData.password} onChange={(event) => setLoginData({ ...loginData, password: event.target.value })} autoComplete="current-password" /></label>
                    <button className="primary-button full-width" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Log in'}</button>
                  </form>
                ) : (
                  <form className="form-layout" onSubmit={handleRegister}>
                    <label>Full name<input required maxLength="100" value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} autoComplete="name" /></label>
                    <label>Email address<input required type="email" value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} autoComplete="email" /></label>
                    <label>Phone number<input required maxLength="20" value={registration.phone} onChange={(event) => setRegistration({ ...registration, phone: event.target.value })} autoComplete="tel" /></label>
                    <label>Password<input required type="password" minLength="8" value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })} autoComplete="new-password" /></label>
                    <button className="primary-button full-width" disabled={busy} type="submit">{busy ? 'Creating account…' : 'Create account'}</button>
                  </form>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === 'admin' && (
          <section className="admin-section">
            <div className="admin-intro"><span className="form-icon"><ShieldCheck size={22} /></span><div><h2>Review reports</h2><p>Only approved reports are visible to the campus community.</p></div></div>
            <form className="admin-key-form" onSubmit={loadAdminQueue}>
              <label>Local admin key<input required type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="Enter the key configured on the backend" /></label>
              <button className="primary-button" disabled={busy} type="submit">{busy ? 'Loading…' : 'Load review queue'}</button>
            </form>
            {!adminLoaded ? (
              <p className="admin-help">Set <code>LOST_FOUND_ADMIN_KEY</code> in the backend terminal, then enter the same key here. This local-key setup is for development, not production authentication.</p>
            ) : (
              <>
                <div className="section-heading"><div><p className="eyebrow">MODERATION</p><h2>Pending reports <span className="count-pill">{adminItems.length}</span></h2></div></div>
                {adminItems.length === 0 && <p className="empty-inline">No reports waiting for review.</p>}
                <div className="admin-list">
                  {adminItems.map((item) => (
                    <article className="admin-card" key={item.id}>
                      {adminPhotoUrls[item.id] && <img src={adminPhotoUrls[item.id]} alt={item.title} />}
                      <div className="admin-card-info"><span className={`tag ${item.status}`}>{item.status}</span><h3>{item.title}</h3><p>{item.description}</p><small>{item.category} · {item.location} · {item.date_reported} · by {item.owner?.name}</small></div>
                      <div className="admin-actions"><button className="approve-button" disabled={busy} onClick={() => reviewItem(item.id, 'approved')}><CheckCircle2 size={17} /> Approve</button><button className="reject-button" disabled={busy} onClick={() => reviewItem(item.id, 'rejected')}><X size={17} /> Reject</button></div>
                    </article>
                  ))}
                </div>
                <div className="section-heading claims-heading"><div><p className="eyebrow">CLAIM REVIEW</p><h2>Pending claims <span className="count-pill">{adminClaims.length}</span></h2></div></div>
                {adminClaims.length === 0 && <p className="empty-inline">No claims waiting for review.</p>}
                <div className="admin-list">
                  {adminClaims.map((claim) => (
                    <article className="admin-card claim-review-card" key={claim.id}>
                      <div className="admin-card-info"><span className="tag category-tag">Item #{claim.item_id}</span><h3>Claim from {claim.claimant?.name}</h3><p>{claim.proof_description}</p><small>{claim.claimant?.email} · {claim.claimant?.phone}</small></div>
                      <div className="admin-actions"><button className="approve-button" disabled={busy} onClick={() => reviewClaim(claim.id, 'approved')}><CheckCircle2 size={17} /> Approve</button><button className="reject-button" disabled={busy} onClick={() => reviewClaim(claim.id, 'rejected')}><X size={17} /> Reject</button></div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        <NavButton id="browse" active={activeTab} onClick={navigate} icon={<Search size={20} />} label="Browse" />
        <NavButton id="report" active={activeTab} onClick={navigate} icon={<Plus size={20} />} label="Report" />
        <NavButton id="alerts" active={activeTab} onClick={navigate} icon={<Bell size={20} />} label="Alerts" count={unreadCount} />
        <NavButton id="account" active={activeTab} onClick={navigate} icon={<UserRound size={20} />} label="Account" />
        <NavButton id="admin" active={activeTab} onClick={navigate} icon={<ShieldCheck size={20} />} label="Admin" />
      </nav>
      {viewingImage && (
        <div
          className="image-viewer-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setViewingImage(null);
          }}
        >
          <div className="image-viewer" role="dialog" aria-modal="true" aria-label={`${viewingImage.alt} image`}>
            <button
              ref={imageViewerCloseRef}
              className="image-viewer-close"
              type="button"
              aria-label="Close full-screen image"
              onClick={() => setViewingImage(null)}
            >
              <X size={22} />
            </button>
            <img src={viewingImage.src} alt={viewingImage.alt} />
          </div>
        </div>
      )}
      {cameraOpen && (
        <div className="image-viewer-backdrop camera-backdrop">
          <section className="camera-dialog" role="dialog" aria-modal="true" aria-labelledby="camera-dialog-title">
            <header className="camera-dialog-header">
              <h2 id="camera-dialog-title">Take a photo</h2>
              <button
                ref={cameraCloseRef}
                className="image-viewer-close"
                type="button"
                aria-label="Close camera"
                onClick={() => setCameraOpen(false)}
              >
                <X size={22} />
              </button>
            </header>
            {cameraError ? (
              <p className="camera-error" role="alert">{cameraError}</p>
            ) : (
              <video
                ref={cameraVideoRef}
                className="camera-preview"
                autoPlay
                muted
                playsInline
                aria-label="Live camera preview"
              />
            )}
            <div className="camera-dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setCameraOpen(false)}>Cancel</button>
              <button className="primary-button" type="button" disabled={!cameraReady} onClick={capturePhoto}>
                <Camera size={17} /> Capture photo
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function NavButton({ id, active, onClick, icon, label, count = 0 }) {
  return (
    <button className={`nav-button ${active === id ? 'active' : ''}`} onClick={() => onClick(id)} aria-current={active === id ? 'page' : undefined}>
      <span className="nav-icon">{icon}{count > 0 && <span className="nav-badge">{count > 9 ? '9+' : count}</span>}</span>
      <span>{label}</span>
    </button>
  );
}

function tabTitle(tab) {
  return {
    report: 'Report an item',
    alerts: 'Your notifications',
    account: 'Your account',
    admin: 'Admin review',
  }[tab] || 'Campus Finds';
}

export default App;
