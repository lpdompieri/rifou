import { useCallback, useEffect, useRef, useState } from 'react';

const navItems = [
  { id: 'overview', label: 'Visão geral', icon: 'home' },
  { id: 'raffles', label: 'Minhas rifas', icon: 'ticket' },
  { id: 'participants', label: 'Participantes', icon: 'users' },
  { id: 'draw', label: 'Sorteios', icon: 'draw' },
  { id: 'finance', label: 'Financeiro', icon: 'wallet' },
  { id: 'audit', label: 'Auditoria', icon: 'history' },
  { id: 'support', label: 'Suporte', icon: 'help' },
];

function DashIcon({ name, size = 18 }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" /></>,
    ticket: <><path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 0 0-4V4H3v4Z" /><path d="M14 4v12" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M16 15h2" /><path d="M7 5V3h10v2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 1.1 1.8-1.8 3.1-2.1-.2a7.9 7.9 0 0 1-1.7 1l-.9 1.8h-3.6l-.9-1.8a7.9 7.9 0 0 1-1.7-1l-2.1.2-1.8-3.1L5 15a8 8 0 0 1 0-2l-1.1-1.8 1.8-3.1 2.1.2a7.9 7.9 0 0 1 1.7-1l.9-1.8H14l.9 1.8a7.9 7.9 0 0 1 1.7 1l2.1-.2 1.8 3.1-1.1 1.8a8 8 0 0 1 0 2Z" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    draw: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="m15 9 5-5M17 4h3v3" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M4 15v5h16v-5" /></>,
    history: <><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" /><path d="M3 3v5h5m4-1v5l3 2" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.3 1.75c-1.2 1.2-1.9 1.4-1.9 3.25M12 17.5h.01" /></>,
  };

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function RifouLogo({ light = false }) {
  return (
    <a className={`brand${light ? ' brand--light' : ''}`} href="/" aria-label="RIFOU, página inicial">
      <span className="brand__mark"><DashIcon name="ticket" size={21} /></span>
      <span className="brand__word">RIFOU</span>
    </a>
  );
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function currentMonthValue() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}

function raffleCreatedInMonth(raffle, month) {
  if (!month) return true;
  if (!raffle?.createdAt) return false;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(new Date(raffle.createdAt)).slice(0, 7) === month;
}

function formatCurrencyField(valueInCents) {
  const parsedCents = Number(valueInCents);
  const cents = Number.isFinite(parsedCents) ? parsedCents : 0;
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCurrencyToCents(value) {
  const raw = String(value ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!raw || !/\d/.test(raw)) return 0;

  let normalized;
  if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  } else if (raw.includes('.')) {
    const decimalDigits = raw.slice(raw.lastIndexOf('.') + 1);
    normalized = decimalDigits.length > 0 && decimalDigits.length <= 2
      ? raw.replace(/[^\d.]/g, '')
      : raw.replace(/\D/g, '');
  } else {
    const cents = Number(raw.replace(/\D/g, ''));
    return Number.isSafeInteger(cents) ? cents : 0;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function CurrencyControl({ name, value, onChange, onBlur, readOnly = false, disabled = false, required = false }) {
  const handleChange = (event) => {
    const raw = event.target.value;
    if (!raw) {
      onChange?.('');
      return;
    }
    const digits = raw.replace(/\D/g, '');
    const cents = Number(digits);
    onChange?.(Number.isSafeInteger(cents) ? formatCurrencyField(cents) : '');
  };

  return <div className={`dashboard-currency-control${disabled ? ' dashboard-currency-control--disabled' : ''}`}>
    <span aria-hidden="true">R$</span>
    <input
      name={name}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={handleChange}
      onBlur={onBlur}
      readOnly={readOnly}
      disabled={disabled}
      required={required}
      maxLength={18}
    />
  </div>;
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Não foi possível concluir a solicitação.');
  return result;
}

async function organizerApi(path, options = {}, retryAfterRefresh = true) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  if (response.status === 401 && retryAfterRefresh) {
    const session = await fetch('/api/organizador/auth/session', { cache: 'no-store' });
    if (session.ok) return organizerApi(path, options, false);
    if (session.status === 401) window.location.assign('/organizador/login');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Não foi possível concluir a solicitação.');
  return result;
}

function normalizeOrganizerRaffle(item) {
  const numberCount = Number(item.numberCount ?? item.numbers ?? 0);
  const maxNumbersPerUser = Number(item.maxNumbersPerUser || Math.min(97, numberCount || 97));
  const prizeValueInCents = Number(item.prizeValueInCents || 0);
  const status = ({ ACTIVE: 'Ativa', DRAFT: 'Rascunho', INACTIVE: 'Inativa', DRAWN: 'Sorteada', COMPLETED: 'Concluída' })[item.status] || item.status || 'Rascunho';
  return {
    ...item,
    id: item.id || item.raffleId,
    numbers: String(numberCount),
    numberCount,
    maxNumbersPerUser,
    prizeValueInCents,
    price: item.priceInCents !== undefined ? String(Number(item.priceInCents || 0) / 100) : String(item.price || '0').replace(',', '.'),
    drawingDate: item.drawingDate || '',
    status,
    sold: Number(item.sold || 0),
    reserved: Number(item.reserved || 0),
    confirmed: Number(item.confirmed || 0),
    financialsLocked: Boolean(item.financialsLocked || Number(item.reserved || 0) > 0 || Number(item.confirmed || 0) > 0),
    drawResult: item.drawResult || null,
  };
}

function formRafflePayload(formData, organizer) {
  return {
    title: String(formData.get('title') || '').trim(),
    description: String(formData.get('description') || '').trim(),
    prizeValueInCents: parseCurrencyToCents(formData.get('prizeValue')),
    image: String(formData.get('image') || '').trim(),
    imageAlt: String(formData.get('imageAlt') || '').trim() || String(formData.get('title') || '').trim(),
    priceInCents: parseCurrencyToCents(formData.get('price')),
    numberCount: Number(formData.get('numbers')),
    maxNumbersPerUser: Number(formData.get('maxNumbersPerUser')),
    featured: formData.get('featured') === 'on',
    drawingDate: String(formData.get('date') || ''),
    status: String(formData.get('status') || 'DRAFT'),
    organizer,
  };
}

async function uploadRaffleImage(file) {
  const upload = await organizerApi('/api/organizador/raffle-images/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  if (!upload.uploadUrl || !upload.fields || !upload.imageUrl) {
    throw new Error('A autorização do upload de imagem veio incompleta.');
  }

  const formData = new FormData();
  Object.entries(upload.fields).forEach(([name, value]) => formData.append(name, value));
  formData.append('file', file);
  const response = await fetch(upload.uploadUrl, { method: 'POST', body: formData });
  if (!response.ok) throw new Error('Não foi possível enviar a imagem. Confira o arquivo e tente novamente.');
  return upload.imageUrl;
}

function AuthLayout({ children, mode = 'login' }) {
  const copy = mode === 'login'
    ? ['Bem-vindo de volta', 'Entre com seus dados para acessar o painel.']
    : mode === 'recover'
      ? ['Recupere seu acesso', 'Vamos ajudar você a voltar para o seu painel.']
      : ['Vamos organizar juntos?', 'Conte um pouco sobre você para solicitar acesso.'];

  return (
    <main className="organizer-auth">
      <section className="organizer-auth__story">
        <RifouLogo light />
        <div className="organizer-auth__story-copy">
          <span className="organizer-auth__badge"><DashIcon name="check" size={14} /> Feito para organizadores</span>
          <h1>Gerencie suas rifas com <span>clareza e confiança.</span></h1>
          <p>Tenha controle sobre vendas, reservas e participantes — tudo em um só lugar.</p>
        </div>
        <div className="organizer-auth__benefits">
          <div><DashIcon name="check" size={16} /><span><strong>Transparência em tempo real</strong><small>Acompanhe cada número e pagamento.</small></span></div>
          <div><DashIcon name="check" size={16} /><span><strong>Compartilhamento simples</strong><small>Um link exclusivo pronto para divulgar.</small></span></div>
        </div>
      </section>
      <section className="organizer-auth__main">
        <div className="organizer-auth__form-wrap">
          <a className="organizer-auth__back" href={mode === 'login' ? '/' : '/organizador/login'}><span aria-hidden="true">‹</span>{mode === 'login' ? 'Voltar ao site' : 'Voltar ao login'}</a>
          <p className="section-kicker">Área do organizador</p>
          <h2>{copy[0]}</h2>
          <p className="organizer-auth__intro">{copy[1]}</p>
          {children}
        </div>
        <p className="organizer-auth__demo-footnote">Acesso seguro do RIFOU • Senhas e tokens não ficam no armazenamento do navegador.</p>
      </section>
    </main>
  );
}

function OrganizerLogin({ forcedMessage = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Informe um e-mail válido.');
      return;
    }
    if (!password) {
      setError('Informe sua senha.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await postJson('/api/organizador/auth/login', { email, password });
      if (result.challenge === 'NEW_PASSWORD_REQUIRED') {
        setPasswordChangeRequired(true);
        return;
      }
      window.location.assign('/organizador/dashboard');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompletePassword = async (event) => {
    event.preventDefault();
    setError('');
    if (newPassword.length < 12 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword)
      || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setError('Use uma senha de 12 ou mais caracteres com maiúscula, minúscula, número e símbolo.');
      return;
    }
    setSubmitting(true);
    try {
      await postJson('/api/organizador/auth/complete-password', { newPassword });
      window.location.assign('/organizador/dashboard');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      {passwordChangeRequired ? (
        <form className="organizer-auth__form" onSubmit={handleCompletePassword} noValidate>
          <p className="organizer-auth__notice" role="status">Seu acesso foi aprovado. Defina uma senha pessoal para continuar.</p>
          <label className="organizer-field"><span>Nova senha</span><input type="password" autoComplete="new-password" placeholder="Crie uma senha forte" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          {error && <p className="organizer-auth__error" role="alert">{error}</p>}
          <button className="button button--full organizer-auth__submit" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : 'Definir senha e entrar'} <DashIcon name="arrow" size={18} /></button>
          <button className="organizer-auth__forgot" type="button" onClick={() => { setPasswordChangeRequired(false); setError(''); }}>Voltar ao login</button>
        </form>
      ) : (
        <form className="organizer-auth__form" onSubmit={handleSubmit} noValidate>
          {forcedMessage && <p className="organizer-auth__notice" role="status">{forcedMessage}</p>}
          <label className="organizer-field"><span>E-mail</span><input type="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="organizer-field"><span>Senha</span>
            <span className="organizer-password">
              <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" value={password} onChange={(event) => setPassword(event.target.value)} />
              <button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)}><DashIcon name="eye" size={18} /></button>
            </span>
          </label>
          <a className="organizer-auth__forgot" href="/organizador/recuperar-senha">Esqueci minha senha</a>
          {error && <p className="organizer-auth__error" role="alert">{error}</p>}
          <button className="button button--full organizer-auth__submit" type="submit" disabled={submitting}>{submitting ? 'Entrando...' : 'Entrar no painel'} <DashIcon name="arrow" size={18} /></button>
          <p className="organizer-auth__switch">Ainda não é organizador? <a href="/organizador/solicitar-acesso">Solicite seu acesso</a></p>
          <p className="organizer-auth__demo-note">Acesso liberado após análise da solicitação.</p>
        </form>
      )}
    </AuthLayout>
  );
}

function RecoverAccess() {
  const [email, setEmail] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [stage, setStage] = useState('request');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const requestCode = async (event) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Informe um e-mail válido.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await postJson('/api/organizador/auth/forgot-password', { email });
      setNotice(result.message);
      setStage('confirm');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReset = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await postJson('/api/organizador/auth/confirm-forgot-password', {
        email,
        confirmationCode,
        newPassword,
      });
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout mode="recover">
      {submitted ? (
        <div className="organizer-auth__success" role="status"><span><DashIcon name="check" size={21} /></span><strong>Senha atualizada.</strong><p>Agora você já pode entrar no painel com sua nova senha.</p><a className="button button--full" href="/organizador/login">Voltar ao login</a></div>
      ) : (
        <form className="organizer-auth__form" onSubmit={stage === 'request' ? requestCode : confirmReset} noValidate>
          {notice && <p className="organizer-auth__notice" role="status">{notice}</p>}
          <label className="organizer-field"><span>E-mail cadastrado</span><input type="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={stage === 'confirm'} /></label>
          {stage === 'confirm' && <>
            <label className="organizer-field"><span>Código recebido por e-mail</span><input inputMode="numeric" autoComplete="one-time-code" placeholder="Código de confirmação" value={confirmationCode} onChange={(event) => setConfirmationCode(event.target.value)} /></label>
            <label className="organizer-field"><span>Nova senha</span><input type="password" autoComplete="new-password" placeholder="Crie uma senha forte" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          </>}
          {error && <p className="organizer-auth__error" role="alert">{error}</p>}
          <button className="button button--full organizer-auth__submit" type="submit" disabled={submitting}>{submitting ? 'Aguarde...' : stage === 'request' ? 'Enviar código' : 'Atualizar senha'} <DashIcon name="arrow" size={18} /></button>
          {stage === 'confirm' && <button className="organizer-auth__forgot" type="button" onClick={() => { setStage('request'); setNotice(''); setError(''); }}>Usar outro e-mail</button>}
        </form>
      )}
    </AuthLayout>
  );
}

function RequestOrganizerAccess() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();
    const name = String(formData.get('name') || '').trim();
    const phone = String(formData.get('phone') || '').replace(/\D/g, '');
    if (name.length < 3 || !/^\S+@\S+\.\S+$/.test(email) || phone.length < 10) {
      setError('Confira seu nome, e-mail e WhatsApp com DDD.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await postJson('/api/organizador/access-requests', { name, email, phone });
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout mode="access">
      {submitted ? (
        <div className="organizer-auth__success" role="status"><span><DashIcon name="check" size={21} /></span><strong>Solicitação enviada para análise.</strong><p>Se o acesso for aprovado, você receberá as instruções de entrada por e-mail.</p><a className="button button--full" href="/organizador/login">Voltar ao login</a></div>
      ) : (
        <form className="organizer-auth__form" onSubmit={handleSubmit} noValidate>
          <label className="organizer-field"><span>Nome completo</span><input name="name" autoComplete="name" placeholder="Seu nome" /></label>
          <label className="organizer-field"><span>E-mail</span><input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" /></label>
          <label className="organizer-field"><span>WhatsApp com DDD</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" /></label>
          {error && <p className="organizer-auth__error" role="alert">{error}</p>}
          <button className="button button--full organizer-auth__submit" type="submit" disabled={submitting}>{submitting ? 'Enviando...' : 'Solicitar acesso'} <DashIcon name="arrow" size={18} /></button>
          <p className="organizer-auth__demo-note">Sua solicitação será analisada pela equipe do RIFOU antes da criação do acesso.</p>
        </form>
      )}
    </AuthLayout>
  );
}

function StatusPill({ status }) {
  const label = ({ ACTIVE: 'Ativa', DRAFT: 'Rascunho', INACTIVE: 'Inativa', DRAWN: 'Sorteada', COMPLETED: 'Concluída' })[status] || status;
  const variant = ['Confirmado', 'Ativa', 'Sorteada'].includes(label) ? 'success' : label === 'Aguardando Pix' ? 'pending' : ['Expirado', 'Inativa', 'Concluída'].includes(label) ? 'muted' : 'draft';
  return <span className={`dashboard-status dashboard-status--${variant}`}>{label}</span>;
}

function DashboardHeading({ eyebrow, title, description, action }) {
  return <div className="dashboard-heading"><div><p className="section-kicker">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function OrganizerDashboard({ user, onUserUpdate }) {
  const [section, setSection] = useState('overview');
  const [raffleList, setRaffleList] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRaffle, setEditingRaffle] = useState(null);
  const [notice, setNotice] = useState('');
  const [managedRaffle, setManagedRaffle] = useState(null);
  const [participantsRaffleId, setParticipantsRaffleId] = useState('');
  const [drawRaffleId, setDrawRaffleId] = useState('');
  const menuItems = [...navItems, { id: 'settings', label: 'Configurações', icon: 'settings' }];
  const displayName = user?.name || user?.email?.split('@')[0] || 'Organizador';
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'OR';

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setDashboardLoading(true);
    try {
      const result = await organizerApi('/api/organizador/dashboard');
      const updatedRaffles = Array.isArray(result.items) ? result.items.map(normalizeOrganizerRaffle) : [];
      const updatedById = new Map(updatedRaffles.map((raffle) => [raffle.id, raffle]));
      setRaffleList(updatedRaffles);
      setManagedRaffle((current) => current ? updatedById.get(current.id) || current : current);
      setEditingRaffle((current) => current ? updatedById.get(current.id) || current : current);
      setSummary(result.summary || null);
      return result;
    } catch (error) {
      if (!silent) setNotice(error.message || 'Não foi possível carregar os dados do painel.');
      throw error;
    } finally {
      if (!silent) setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard().catch(() => {});
    const refresh = () => {
      if (document.visibilityState === 'visible') loadDashboard({ silent: true }).catch(() => {});
    };
    const interval = window.setInterval(refresh, 10_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [loadDashboard]);

  const logout = async () => {
    try {
      await fetch('/api/organizador/auth/logout', { method: 'POST', cache: 'no-store' });
    } finally {
      window.location.assign('/organizador/login');
    }
  };

  const saveRaffle = async (event) => {
    event.preventDefault();
    if (editingRaffle?.status === 'Sorteada' || editingRaffle?.status === 'Concluída' || editingRaffle?.drawResult) {
      setNotice('Rifas sorteadas ou concluídas não podem mais ser editadas.');
      return;
    }
    const formData = new FormData(event.currentTarget);
    const payload = formRafflePayload(formData, displayName);
    const imageFile = formData.get('imageFile');
    const hasImageFile = imageFile instanceof File && imageFile.size > 0;
    if (!Number.isSafeInteger(payload.numberCount) || !Number.isSafeInteger(payload.maxNumbersPerUser)
      || payload.maxNumbersPerUser > Math.min(97, payload.numberCount)) {
      setNotice('O limite por participante deve ser menor ou igual à quantidade de números da rifa.');
      return;
    }
    if (!Number.isSafeInteger(payload.prizeValueInCents)
      || payload.prizeValueInCents !== payload.priceInCents * payload.numberCount) {
      setNotice('O valor total do prêmio precisa ser igual ao valor por número multiplicado pela quantidade de números.');
      return;
    }
    if (payload.status !== 'ACTIVE') payload.featured = false;
    setSaving(true);
    setNotice('');
    try {
      if (hasImageFile) payload.image = await uploadRaffleImage(imageFile);
      const result = editingRaffle
        ? await organizerApi(`/api/organizador/raffles/${encodeURIComponent(editingRaffle.id)}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
        })
        : await organizerApi('/api/organizador/raffles', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
        });
      const saved = normalizeOrganizerRaffle(result.item);
      let featuredError = '';
      const shouldSetFeatured = payload.featured && payload.status === 'ACTIVE';
      const shouldClearFeatured = Boolean(editingRaffle?.featured && !shouldSetFeatured);
      if (shouldSetFeatured || shouldClearFeatured) {
        try {
          await organizerApi('/api/organizador/home-featured-raffle', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ raffleId: shouldSetFeatured ? saved.id : null }),
          });
        } catch (error) {
          featuredError = error.message || 'Não foi possível atualizar a rifa em destaque.';
        }
      }
      const dashboard = await loadDashboard();
      const savedRaffle = Array.isArray(dashboard.items)
        ? dashboard.items.map(normalizeOrganizerRaffle).find((raffle) => raffle.id === saved.id) || saved
        : saved;
      setEditingRaffle(null);
      setNotice(featuredError
        ? `Rifa salva, mas o destaque não foi atualizado: ${featuredError}`
        : editingRaffle ? 'Rifa atualizada.' : 'Rifa criada com sucesso.');
      setManagedRaffle(savedRaffle);
      setSection('raffle-detail');
    } catch (error) {
      setNotice(error.message || 'Não foi possível salvar a rifa.');
    } finally {
      setSaving(false);
    }
  };

  const goTo = (id, raffleId = '') => { setNotice(''); if (id === 'create') setEditingRaffle(null); if (id === 'participants' && raffleId) setParticipantsRaffleId(raffleId); if (id === 'draw' && raffleId) setDrawRaffleId(raffleId); setSection(id); };
  const openRaffle = (raffle) => { setNotice(''); setManagedRaffle(raffle); setSection('raffle-detail'); };
  const editRaffle = (raffle) => {
    if (raffle?.status === 'Sorteada' || raffle?.status === 'Concluída' || raffle?.drawResult) {
      setNotice('Rifas sorteadas ou concluídas não podem mais ser editadas.');
      return;
    }
    setNotice(''); setEditingRaffle(raffle); setSection('create');
  };
  const handleRaffleDrawn = (item) => {
    const updated = normalizeOrganizerRaffle(item);
    setRaffleList((current) => current.map((raffle) => raffle.id === updated.id ? updated : raffle));
    setManagedRaffle((current) => current?.id === updated.id ? updated : current);
    loadDashboard({ silent: true }).catch(() => {});
  };
  const navButton = (item) => <button key={item.id} className={`dashboard-nav__item${section === item.id ? ' dashboard-nav__item--active' : ''}`} type="button" onClick={() => goTo(item.id)}><DashIcon name={item.icon} size={18} /><span>{item.label}</span></button>;

  return (
    <div className="organizer-dashboard">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar__brand"><RifouLogo /></div>
        <div className="dashboard-sidebar__account"><span className="dashboard-avatar">{initials}</span><span><strong>{displayName}</strong><small>Organizador</small></span></div>
        <p className="dashboard-nav__label">MENU PRINCIPAL</p>
        <nav className="dashboard-nav" aria-label="Menu do organizador">{menuItems.map(navButton)}</nav>
        <div className="dashboard-sidebar__bottom"><div className="dashboard-help"><span><DashIcon name="eye" size={18} /></span><strong>Precisa de ajuda?</strong><small>Estamos aqui para apoiar você.</small><button type="button" onClick={() => goTo('support')}>Falar com suporte <DashIcon name="arrow" size={14} /></button></div><button className="dashboard-nav__item dashboard-nav__logout" type="button" onClick={logout}><DashIcon name="logout" size={18} /><span>Sair do painel</span></button></div>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-topbar"><div className="dashboard-topbar__crumb"><span>Painel</span><span>/</span><strong>{section === 'raffle-detail' ? managedRaffle?.title : menuItems.find((item) => item.id === section)?.label || (section === 'create' ? (editingRaffle ? 'Editar rifa' : 'Nova rifa') : 'Painel')}</strong></div><div className="dashboard-topbar__actions"><span className="dashboard-demo-badge">{dashboardLoading ? 'Sincronizando...' : 'Dados da sua conta'}</span><button className="dashboard-icon-button" type="button" aria-label="Notificações" onClick={() => setNotice('Nenhuma notificação disponível.') }><DashIcon name="bell" size={18} /></button><button className="dashboard-topbar__profile" type="button" onClick={() => goTo('settings')}><span className="dashboard-avatar dashboard-avatar--small">{initials}</span><span>{displayName}</span></button></div></header>
        <div className="dashboard-content">
          {notice && <p className="dashboard-notice" role="status">{notice}<button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}>×</button></p>}
          {dashboardLoading && !summary && <p className="organizer-auth__notice" role="status">Carregando seu painel...</p>}
          {section === 'overview' && !dashboardLoading && <OverviewSection raffles={raffleList} summary={summary} displayName={displayName} goTo={goTo} onManage={openRaffle} />}
          {section === 'raffles' && !dashboardLoading && <RafflesSection raffles={raffleList} goTo={goTo} onManage={openRaffle} />}
          {section === 'raffle-detail' && managedRaffle && <RaffleManagementSection raffle={managedRaffle} goTo={goTo} onEdit={editRaffle} />}
          {section === 'participants' && <ParticipantsSection raffles={raffleList} initialRaffleId={participantsRaffleId} />}
          {section === 'draw' && <DrawsSection raffles={raffleList} initialRaffleId={drawRaffleId} onDrawn={handleRaffleDrawn} />}
          {section === 'finance' && <FinanceSection summary={summary} raffles={raffleList} />}
          {section === 'audit' && <AuditSection raffles={raffleList} />}
          {section === 'support' && <SupportSection raffles={raffleList} />}
          {section === 'settings' && <SettingsSection user={user} setNotice={setNotice} onProfileUpdated={onUserUpdate} />}
          {section === 'create' && <CreateRaffleSection raffle={editingRaffle} onSubmit={saveRaffle} onCancel={() => goTo(editingRaffle ? 'raffle-detail' : 'raffles')} saving={saving} />}
        </div>
      </main>
    </div>
  );
}

function OverviewSection({ raffles, summary = {}, displayName, goTo, onManage }) {
  const [month, setMonth] = useState('');
  const [monthFinance, setMonthFinance] = useState(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState('');
  useEffect(() => {
    if (!month) {
      setMonthFinance(null);
      setMonthError('');
      return;
    }
    let active = true;
    setMonthLoading(true);
    setMonthError('');
    organizerApi(`/api/organizador/finance?month=${encodeURIComponent(month)}`)
      .then((result) => { if (active) setMonthFinance(result); })
      .catch((error) => { if (active) setMonthError(error.message || 'Não foi possível carregar o resumo do mês.'); })
      .finally(() => { if (active) setMonthLoading(false); });
    return () => { active = false; };
  }, [month]);

  const visibleRaffles = month ? raffles.filter((raffle) => raffleCreatedInMonth(raffle, month)) : raffles;
  const monthlySummary = monthFinance?.filters?.month === month ? monthFinance?.summary || {} : {};
  const currentSummary = month ? monthlySummary : summary;
  const stats = month ? [
    { label: 'Rifas criadas no mês', value: String(visibleRaffles.length), change: 'Campanhas criadas neste período', icon: 'ticket', color: 'green' },
    { label: 'Arrecadação confirmada', value: formatMoney(Number(currentSummary.confirmedRevenueInCents || 0) / 100), change: 'Pagamentos confirmados no mês', icon: 'wallet', color: 'blue' },
    { label: 'Números confirmados', value: String(currentSummary.confirmedNumbers || 0), change: 'Pagamentos confirmados no mês', icon: 'users', color: 'gold' },
    { label: 'Pendente de receber', value: formatMoney(Number(currentSummary.pendingAmountInCents || 0) / 100), change: `${currentSummary.reservedNumbers || 0} reservas ainda válidas neste mês`, icon: 'clock', color: 'purple' },
  ] : [
    { label: 'Rifas ativas', value: String(summary.activeRaffles || 0), change: `${summary.draftRaffles || 0} rascunhos`, icon: 'ticket', color: 'green' },
    { label: 'Arrecadação confirmada', value: formatMoney(Number(summary.confirmedRevenueInCents || 0) / 100), change: 'Pagamentos conciliados', icon: 'wallet', color: 'blue' },
    { label: 'Números confirmados', value: String(summary.confirmedNumbers || 0), change: 'Pagamentos confirmados', icon: 'users', color: 'gold' },
    { label: 'Números reservados', value: String(summary.reservedNumbers || 0), change: `${formatMoney(Number(summary.reservedAmountInCents || 0) / 100)} em pedidos pendentes`, icon: 'clock', color: 'purple' },
  ];

  return <>
    <DashboardHeading eyebrow="Resumo da operação" title={`Olá, ${displayName}`} description="Acompanhe o desempenho das suas rifas em um só lugar." action={<div className="dashboard-heading-actions"><label className="organizer-field dashboard-month-filter"><span>Período</span><select value={month ? 'month' : 'all'} onChange={(event) => setMonth(event.target.value === 'month' ? (month || currentMonthValue()) : '')}><option value="all">Todos os períodos</option><option value="month">Por mês</option></select></label>{month && <label className="organizer-field dashboard-month-filter"><span>Mês</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>}<button className="button dashboard-create-button" type="button" onClick={() => goTo('create')}><DashIcon name="plus" size={17} /> Criar nova rifa</button></div>} />
    {monthError && <p className="organizer-auth__error" role="alert">{monthError}</p>}
    {monthLoading && <p className="organizer-auth__notice" role="status">Carregando o resumo mensal...</p>}
    <div className="dashboard-stats">{stats.map((stat) => <article className="dashboard-stat" key={stat.label}><span className={`dashboard-stat__icon dashboard-stat__icon--${stat.color}`}><DashIcon name={stat.icon} size={19} /></span><span className="dashboard-stat__label">{stat.label}</span><strong>{stat.value}</strong><small>{stat.change}</small></article>)}</div>
    <div className="dashboard-overview-grid">
      <section className="dashboard-card dashboard-chart-card"><div className="dashboard-card__heading"><div><h2>Desempenho das rifas</h2><p>{month ? 'Campanhas criadas no mês selecionado' : 'Números reservados e confirmados por campanha'}</p></div><button className="dashboard-text-button" type="button" onClick={() => goTo('raffles')}>Ver rifas</button></div>{visibleRaffles.length ? visibleRaffles.slice(0, 5).map((raffle) => <div className="dashboard-performance-row" key={raffle.id}><span><strong>{raffle.title}</strong><small>{raffle.reserved} reservados · {raffle.confirmed} confirmados de {raffle.numberCount}</small></span><span className="dashboard-inline-progress"><i style={{ width: `${raffle.sold}%` }} /></span></div>) : <p className="dashboard-empty">{month ? 'Nenhuma rifa foi criada neste mês.' : 'Você ainda não cadastrou rifas. Crie sua primeira campanha para acompanhar os resultados.'}</p>}<p className="dashboard-chart-card__caption"><span /> Os números reservados ainda não representam pagamentos confirmados.</p></section>
      <section className="dashboard-card dashboard-activity-card"><div className="dashboard-card__heading"><div><h2>Resumo financeiro</h2><p>{month ? `Movimento de ${month}` : 'Baseado no estado atual das rifas'}</p></div></div><div className="dashboard-finance-summary"><span>Receita confirmada<strong>{formatMoney(Number(currentSummary.confirmedRevenueInCents || 0) / 100)}</strong></span><span>{month ? 'Pendente no mês' : 'Valor em reservas'}<strong>{formatMoney(Number((month ? currentSummary.pendingAmountInCents : currentSummary.reservedAmountInCents) || 0) / 100)}</strong></span></div><p className="dashboard-table-note">Os pedidos Pix desta etapa são demonstrativos. A receita só será confirmada após integração de pagamento.</p></section>
    </div>
    <section className="dashboard-card dashboard-raffles-card"><div className="dashboard-card__heading"><div><h2>Suas rifas</h2><p>{month ? visibleRaffles.length : summary.raffleCount || 0} campanhas {month ? 'criadas no mês' : 'cadastradas'}</p></div><button className="dashboard-text-button" type="button" onClick={() => goTo('raffles')}>Ver todas <DashIcon name="arrow" size={15} /></button></div><RaffleTable raffles={visibleRaffles.slice(0, 3)} onManage={onManage} /></section>
  </>;
}

function RaffleTable({ raffles, compact = false, onManage = () => {} }) {
  return <div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>Rifa</th><th>Valor por número</th><th>Andamento</th><th>Status</th><th /></tr></thead><tbody>{raffles.map((raffle) => { const sold = Number(raffle.sold || 0); return <tr key={raffle.id}><td><span className="dashboard-raffle-cell"><img src={raffle.image || '/images/watch.avif'} alt="" /><span><strong>{raffle.title}</strong><small>{raffle.numbers} números</small></span></span></td><td>{formatMoney(Number(String(raffle.price || '0').replace(',', '.')))}</td><td><span className="dashboard-progress-label">{sold}%</span><span className="dashboard-inline-progress"><i style={{ width: `${sold}%` }} /></span></td><td><StatusPill status={raffle.status || 'Ativa'} /></td><td><button className="dashboard-row-action" type="button" aria-label={`Gerenciar ${raffle.title}`} onClick={() => onManage(raffle)}>Gerenciar <DashIcon name="arrow" size={14} /></button></td></tr>; })}</tbody></table>{!raffles.length && <p className="dashboard-empty">Nenhuma rifa cadastrada ainda.</p>}{compact && <p className="dashboard-table-note">Os dados são carregados da sua conta no RIFOU.</p>}</div>;
}

function RafflesSection({ raffles, goTo, onManage }) {
  const [month, setMonth] = useState('');
  const visibleRaffles = raffles.filter((raffle) => raffleCreatedInMonth(raffle, month));
  return <><DashboardHeading eyebrow="Gestão de rifas" title="Minhas rifas" description="Acompanhe suas campanhas e crie novas oportunidades." action={<div className="dashboard-heading-actions"><label className="organizer-field dashboard-month-filter"><span>Mês de criação</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>{month && <button className="dashboard-period" type="button" onClick={() => setMonth('')}>Todos os meses</button>}<button className="button dashboard-create-button" type="button" onClick={() => goTo('create')}><DashIcon name="plus" size={17} /> Criar nova rifa</button></div>} /><section className="dashboard-card dashboard-raffles-card"><RaffleTable raffles={visibleRaffles} onManage={onManage} />{month && !visibleRaffles.length && <p className="dashboard-empty">Nenhuma rifa foi criada neste mês.</p>}</section></>;
}

function RaffleManagementSection({ raffle, goTo, onEdit }) {
  const [showDrawReceipt, setShowDrawReceipt] = useState(false);
  const sold = Number(raffle.sold || 0);
  const totalNumbers = Number(raffle.numbers || 0);
  const unitPrice = Number(String(raffle.price || '0').replace(',', '.'));
  const amountRaised = Number(raffle.confirmed || 0) * unitPrice;
  const reservedAmount = Number(raffle.reserved || 0) * unitPrice;
  const drawResult = raffle.drawResult;
  const isFinal = raffle.status === 'Sorteada' || raffle.status === 'Concluída' || Boolean(drawResult);
  return <>
    <DashboardHeading eyebrow="Gestão de rifas" title={raffle.title} description="Resumo da campanha e atalhos para acompanhar a operação." action={<div className="dashboard-detail-actions"><StatusPill status={raffle.status || 'Ativa'} />{drawResult ? <button className="dashboard-period" type="button" onClick={() => setShowDrawReceipt(true)}>Comprovante de sorteio</button> : raffle.status === 'Ativa' ? <button className="dashboard-period" type="button" onClick={() => goTo('draw', raffle.id)}>Realizar sorteio</button> : null}{!isFinal && <button className="dashboard-period" type="button" onClick={() => onEdit(raffle)}>Editar rifa</button>}</div>} />
    {drawResult && <section className="dashboard-card dashboard-draw-result"><span className="dashboard-draw-result__icon"><DashIcon name="check" size={21} /></span><div><strong>Sorteio realizado com sucesso</strong><p>Número {String(drawResult.number).padStart(String(totalNumbers).length, '0')} · {drawResult.winnerName} · {drawResult.drawnAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(drawResult.drawnAt)) : 'Data não disponível'}</p></div></section>}
    <div className="dashboard-raffle-detail-grid">
      <section className="dashboard-card dashboard-raffle-detail"><img src={raffle.image || '/images/watch.avif'} alt={raffle.imageAlt || ''} /><div><span className="dashboard-detail-kicker">Resumo da rifa</span><h2>{raffle.title}</h2><p>Organizada por {raffle.organizer}</p><div className="dashboard-detail-facts"><span><small>Valor total do prêmio</small><strong>{formatMoney(Number(raffle.prizeValueInCents || 0) / 100)}</strong></span><span><small>Valor por número</small><strong>{formatMoney(unitPrice)}</strong></span><span><small>Limite por participante</small><strong>{raffle.maxNumbersPerUser} por telefone</strong></span><span><small>Números disponíveis</small><strong>{Math.max(0, totalNumbers - Number(raffle.reserved || 0) - Number(raffle.confirmed || 0))} de {totalNumbers}</strong></span><span><small>Números reservados</small><strong>{raffle.reserved || 0}</strong></span><span><small>Números confirmados</small><strong>{raffle.confirmed || 0}</strong></span><span><small>Receita confirmada</small><strong>{formatMoney(amountRaised)}</strong></span></div><div className="dashboard-detail-progress"><span>Andamento <strong>{sold}%</strong></span><i><b style={{ width: `${sold}%` }} /></i></div><p className="dashboard-table-note">Valor em pedidos reservados: {formatMoney(reservedAmount)}. A reserva não confirma o pagamento. {raffle.financialsLocked ? 'Os valores da rifa estão travados após a primeira reserva.' : 'Os valores serão travados após a primeira reserva.'}</p></div></section>
      <section className="dashboard-card dashboard-manage-shortcuts"><h2>Atalhos</h2><button type="button" onClick={() => goTo('participants', raffle.id)}><DashIcon name="users" size={18} /><span><strong>Ver participantes</strong><small>Consulte reservas e pedidos desta campanha.</small></span><DashIcon name="arrow" size={16} /></button>{drawResult ? <button type="button" onClick={() => setShowDrawReceipt(true)}><DashIcon name="check" size={18} /><span><strong>Consultar comprovante de sorteio</strong><small>Veja o número, ganhador e data registrados.</small></span><DashIcon name="arrow" size={16} /></button> : raffle.status === 'Ativa' ? <button type="button" onClick={() => goTo('draw', raffle.id)}><DashIcon name="draw" size={18} /><span><strong>Abrir sorteio</strong><small>Exige data prevista alcançada e participações confirmadas.</small></span><DashIcon name="arrow" size={16} /></button> : null}<button type="button" onClick={() => goTo('finance')}><DashIcon name="wallet" size={18} /><span><strong>Acompanhar financeiro</strong><small>Consulte os totais confirmados e reservados.</small></span><DashIcon name="arrow" size={16} /></button><button type="button" onClick={() => goTo('raffles')}><DashIcon name="ticket" size={18} /><span><strong>Voltar para minhas rifas</strong><small>Veja todas as campanhas.</small></span><DashIcon name="arrow" size={16} /></button></section>
    </div>
    {showDrawReceipt && drawResult && <DrawReceipt raffle={raffle} onClose={() => setShowDrawReceipt(false)} />}
  </>;
}

function DrawsSection({ raffles, initialRaffleId, onDrawn }) {
  const activeRaffles = raffles.filter((raffle) => raffle.status === 'Ativa' && !raffle.drawResult);
  const initialActive = activeRaffles.find((raffle) => raffle.id === initialRaffleId) || activeRaffles[0];
  const [raffleId, setRaffleId] = useState(initialActive?.id || '');
  const [rolling, setRolling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayNumber, setDisplayNumber] = useState(1);
  const [error, setError] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [drawnRaffle, setDrawnRaffle] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const animationInterval = useRef(null);
  const raffle = activeRaffles.find((item) => item.id === raffleId);
  const totalNumbers = Number(raffle?.numberCount || 0);
  const confirmedCount = Number(raffle?.confirmed || 0);
  const reservedCount = Number(raffle?.reserved || 0);
  const availableCount = Math.max(0, totalNumbers - confirmedCount - reservedCount);
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const currentDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const dateReached = Boolean(raffle?.drawingDate && raffle.drawingDate <= currentDate);
  const plannedDateLabel = raffle?.drawingDate
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${raffle.drawingDate}T00:00:00Z`))
    : 'A definir';
  const canDraw = raffle?.status === 'Ativa' && dateReached && confirmedCount > 0 && !rolling && !saving;

  useEffect(() => {
    const next = activeRaffles.find((item) => item.id === initialRaffleId) || activeRaffles[0];
    if (next) setRaffleId(next.id);
  }, [initialRaffleId, activeRaffles.map((item) => item.id).join('|')]);

  useEffect(() => () => window.clearInterval(animationInterval.current), []);
  useEffect(() => {
    window.clearInterval(animationInterval.current);
    if (!rolling || totalNumbers < 1) return undefined;
    animationInterval.current = window.setInterval(() => setDisplayNumber(Math.floor(Math.random() * totalNumbers) + 1), 75);
    return () => window.clearInterval(animationInterval.current);
  }, [rolling, totalNumbers]);

  const requestDraw = () => {
    if (!raffle || !canDraw) return;
    setError('');
    setConfirmationMessage(reservedCount > 0
      ? 'Esta rifa possui pendencia de pagamento de números. Tem certeza que deseja sortear a Rifa? Essa ação não poderá ser desfeita.'
      : availableCount > 0
        ? 'Esta rifa possui números disponíveis. Tem certeza que deseja sortear a Rifa? Essa ação não poderá ser desfeita.'
        : 'Tem certeza que deseja sortear a Rifa? Essa ação não poderá ser desfeita.');
  };

  const confirmDraw = async () => {
    if (!raffle || !canDraw) return;
    const currentRaffle = raffle;
    setConfirmationMessage('');
    setSaving(true);
    setError('');
    try {
      const response = await postJson(`/api/organizador/raffles/${encodeURIComponent(currentRaffle.id)}/draw`, {});
      setDisplayNumber(Math.floor(Math.random() * totalNumbers) + 1);
      setRolling(true);
      await new Promise((resolve) => window.setTimeout(resolve, 3600));
      setRolling(false);
      setDrawnRaffle(response.item);
      setShowReceipt(true);
      onDrawn(response.item);
    } catch (drawError) {
      setError(drawError.message || 'Não foi possível realizar o sorteio.');
    } finally {
      setRolling(false);
      setSaving(false);
    }
  };

  const statusMessage = !raffle
    ? 'Não há rifas ativas disponíveis para sorteio.'
    : !dateReached
      ? `O sorteio fica disponível a partir de ${raffle.drawingDate ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${raffle.drawingDate}T00:00:00Z`)) : 'uma data prevista ser definida'}.`
      : confirmedCount < 1
        ? 'Ainda não há números com pagamento confirmado para participar do sorteio.'
        : reservedCount > 0
          ? 'Há reservas aguardando pagamento. Elas não participam do sorteio; somente números confirmados são elegíveis.'
          : 'Tudo pronto. O sorteio considerará somente números com pagamento confirmado.';

  return <>
    <DashboardHeading eyebrow="Resultado transparente" title="Sorteios" description="Realize o sorteio de uma rifa ativa após a data prevista. Somente números com pagamento confirmado participam." />
    {!activeRaffles.length ? <section className="dashboard-card dashboard-empty-state"><DashIcon name="draw" size={24} /><strong>Nenhuma rifa ativa disponível para sorteio.</strong><p>Somente rifas ativas aparecem nesta tela.</p></section> : <>
      <section className="dashboard-card dashboard-draw-controls">
        <label className="organizer-field"><span>Rifa ativa</span><select value={raffleId} onChange={(event) => { setRaffleId(event.target.value); setDrawnRaffle(null); setError(''); }}>
          {activeRaffles.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
        </select></label>
        {raffle && <div className="dashboard-draw-meta"><span><small>Data prevista</small><strong>{plannedDateLabel}</strong></span><span><small>Participações confirmadas</small><strong>{confirmedCount} de {totalNumbers}</strong></span><span><small>Reservas pendentes</small><strong>{reservedCount}</strong></span><StatusPill status={raffle.status} /></div>}
      </section>
      {raffle && <section className={`dashboard-card dashboard-draw-stage${rolling ? ' dashboard-draw-stage--rolling' : ''}`}>
        <div className="dashboard-draw-stage__intro"><span className="dashboard-draw-stage__icon"><DashIcon name="draw" size={24} /></span><p className="section-kicker">Sorteio RIFOU</p><h2>Pronto para descobrir o ganhador?</h2><p>{statusMessage}</p></div>
        <div className={`dashboard-draw-number${rolling ? ' dashboard-draw-number--rolling' : ''}`} aria-live="polite">{String(displayNumber).padStart(String(totalNumbers).length, '0')}</div>
        <button className="button dashboard-draw-button" type="button" onClick={requestDraw} disabled={!canDraw}>{rolling ? 'Sorteando...' : saving ? 'Validando participações...' : 'Iniciar sorteio'} <DashIcon name="draw" size={18} /></button>
        {error && <p className="organizer-auth__error" role="alert">{error}</p>}
      </section>}
    </>}
    {drawnRaffle?.drawResult && <section className="dashboard-card dashboard-draw-success"><div><p className="section-kicker">Sorteio registrado</p><h2>{drawnRaffle.title}</h2><p>Número {String(drawnRaffle.drawResult.number).padStart(String(drawnRaffle.numberCount || 0).length, '0')} · {drawnRaffle.drawResult.winnerName}</p></div><button className="dashboard-period" type="button" onClick={() => setShowReceipt(true)}>Ver comprovante de sorteio</button></section>}
    {confirmationMessage && <div className="dashboard-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setConfirmationMessage(''); }}><section className="dashboard-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-draw-title"><button className="dashboard-dialog__close" type="button" onClick={() => setConfirmationMessage('')} disabled={saving} aria-label="Fechar confirmação">×</button><p className="section-kicker">Confirmação de sorteio</p><h2 id="confirm-draw-title">{raffle?.title}</h2><p className="dashboard-dialog__description">{confirmationMessage}</p><dl className="dashboard-dialog__summary"><div><dt>Números confirmados</dt><dd>{confirmedCount}</dd></div><div><dt>Reservas pendentes</dt><dd>{reservedCount}</dd></div><div><dt>Números disponíveis</dt><dd>{availableCount}</dd></div></dl>{error && <p className="organizer-auth__error" role="alert">{error}</p>}<div className="dashboard-dialog__actions"><button className="dashboard-period" type="button" onClick={() => setConfirmationMessage('')} disabled={saving}>Cancelar</button><button className="button" type="button" onClick={confirmDraw} disabled={saving}>{saving ? 'Preparando sorteio...' : 'Confirmar sorteio'}</button></div></section></div>}
    {showReceipt && drawnRaffle && <DrawReceipt raffle={drawnRaffle} onClose={() => setShowReceipt(false)} />}
  </>;
}

async function createReceiptImage({ item, raffleTitle, numbers, amount, dateText, paymentMethod }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a imagem do comprovante.');
  const rows = [
    ['Rifa', raffleTitle],
    ['Participante', item.customer?.name || 'Participante'],
    ['Números', numbers || '—'],
    ['Valor confirmado', amount],
    ['Data da confirmação', dateText],
    ['Protocolo', item.transactionId],
  ];
  const wrapText = (text, maxWidth) => {
    const words = String(text || '—').split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : ['—'];
  };

  const preparedRows = rows.map(([label, value]) => {
    context.font = '600 32px Arial, sans-serif';
    return { label, lines: wrapText(value, 900) };
  });
  const height = Math.max(1040, 640 + preparedRows.reduce((total, row) => total + 84 + row.lines.length * 44, 0));
  canvas.height = height;
  const draw = canvas.getContext('2d');
  if (!draw) throw new Error('Não foi possível preparar a imagem do comprovante.');
  draw.fillStyle = '#edf4ef';
  draw.fillRect(0, 0, canvas.width, canvas.height);
  draw.fillStyle = '#ffffff';
  draw.beginPath();
  draw.roundRect(44, 44, 992, height - 88, 34);
  draw.fill();

  const headerGradient = draw.createLinearGradient(80, 80, 1000, 260);
  headerGradient.addColorStop(0, '#17583e');
  headerGradient.addColorStop(1, '#258054');
  draw.fillStyle = headerGradient;
  draw.beginPath();
  draw.roundRect(76, 76, 928, 220, 26);
  draw.fill();
  draw.fillStyle = '#ffffff';
  draw.font = '800 58px Arial, sans-serif';
  draw.fillText('RIFOU', 112, 157);
  draw.font = '500 28px Arial, sans-serif';
  draw.fillText('Comprovante de participação', 112, 210);

  draw.fillStyle = '#e8f6ec';
  draw.beginPath();
  draw.roundRect(76, 330, 928, 76, 16);
  draw.fill();
  draw.fillStyle = '#23764a';
  draw.font = '700 25px Arial, sans-serif';
  draw.fillText(paymentMethod.toLocaleUpperCase('pt-BR'), 104, 378);

  let y = 466;
  for (const row of preparedRows) {
    draw.fillStyle = '#839087';
    draw.font = '600 22px Arial, sans-serif';
    draw.fillText(row.label.toLocaleUpperCase('pt-BR'), 104, y);
    y += 44;
    draw.fillStyle = '#263d30';
    draw.font = '600 32px Arial, sans-serif';
    for (const line of row.lines) {
      draw.fillText(line, 104, y);
      y += 44;
    }
    draw.strokeStyle = '#e8eee9';
    draw.lineWidth = 2;
    draw.beginPath();
    draw.moveTo(104, y + 12);
    draw.lineTo(976, y + 12);
    draw.stroke();
    y += 40;
  }
  draw.fillStyle = '#738278';
  draw.font = '500 20px Arial, sans-serif';
  draw.fillText('Registro de participação emitido pelo RIFOU', 104, height - 102);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Falha ao gerar a imagem do comprovante.')), 'image/png');
  });
  return new File([blob], `rifou-comprovante-${String(item.transactionId).slice(0, 8)}.png`, { type: 'image/png' });
}

function ParticipantReceipt({ item, raffleTitle, onClose }) {
  const [copyMessage, setCopyMessage] = useState('');
  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptImageError, setReceiptImageError] = useState('');
  const paidAt = item.paymentConfirmedAt ? new Date(item.paymentConfirmedAt) : null;
  const dateText = paidAt && !Number.isNaN(paidAt.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(paidAt)
    : 'Data não informada';
  const numbers = (item.numbers || []).map((number) => String(number).padStart(2, '0')).join(', ');
  const amount = formatMoney(Number(item.amountInCents || 0) / 100);
  const paymentMethod = item.paymentConfirmationMethod === 'MANUAL'
    ? 'Confirmado manualmente pelo organizador'
    : 'Pagamento confirmado';
  const receiptText = [
    'COMPROVANTE DE PARTICIPAÇÃO — RIFOU',
    `Rifa: ${raffleTitle}`,
    `Participante: ${item.customer?.name || 'Participante'}`,
    `Números: ${numbers || '—'}`,
    `Valor: ${amount}`,
    `Pagamento: ${paymentMethod}`,
    `Data da confirmação: ${dateText}`,
    `Protocolo: ${item.transactionId}`,
  ].join('\n');
  const phone = String(item.customer?.phone || '').replace(/\D/g, '');
  const whatsappUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(receiptText)}`
    : `https://wa.me/?text=${encodeURIComponent(receiptText)}`;
  const emailSubject = encodeURIComponent(`Comprovante RIFOU — ${raffleTitle}`);
  const emailBody = encodeURIComponent(receiptText);

  useEffect(() => {
    let active = true;
    createReceiptImage({ item, raffleTitle, numbers, amount, dateText, paymentMethod })
      .then((file) => { if (active) setReceiptImage(file); })
      .catch(() => { if (active) setReceiptImageError('Não foi possível gerar a imagem. Você ainda pode copiar ou imprimir o comprovante.'); });
    return () => { active = false; };
  }, [item, raffleTitle, numbers, amount, dateText, paymentMethod]);

  const downloadReceiptImage = () => {
    if (!receiptImage) return;
    const url = URL.createObjectURL(receiptImage);
    const link = document.createElement('a');
    link.href = url;
    link.download = receiptImage.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const shareReceiptImage = async () => {
    if (!receiptImage) return;
    let canShareImage = false;
    try {
      canShareImage = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [receiptImage] });
    } catch {
      canShareImage = false;
    }
    if (canShareImage) {
      try {
        await navigator.share({ title: 'Comprovante RIFOU', text: `Comprovante de ${raffleTitle}`, files: [receiptImage] });
        setCopyMessage('Comprovante compartilhado.');
      } catch (error) {
        if (error?.name !== 'AbortError') setCopyMessage('Não foi possível compartilhar. Baixe a imagem e anexe no aplicativo desejado.');
      }
      return;
    }
    downloadReceiptImage();
    setCopyMessage('Imagem baixada. Anexe o arquivo no WhatsApp ou em outro aplicativo.');
  };

  const copyReceipt = async () => {
    try {
      await navigator.clipboard.writeText(receiptText);
      setCopyMessage('Comprovante copiado.');
    } catch {
      setCopyMessage('Não foi possível copiar automaticamente. Selecione o texto do comprovante.');
    }
  };

  return <div className="dashboard-dialog-backdrop receipt-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dashboard-dialog receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
      <button className="dashboard-dialog__close receipt-dialog__close" type="button" onClick={onClose} aria-label="Fechar comprovante">×</button>
      <div className="receipt-heading"><span className="brand__mark"><DashIcon name="ticket" size={20} /></span><div><p>Comprovante de participação</p><h2 id="receipt-title">RIFOU</h2></div></div>
      <div className="receipt-confirmed"><DashIcon name="check" size={17} /> Pagamento confirmado manualmente</div>
      <dl className="receipt-details">
        <div><dt>Rifa</dt><dd>{raffleTitle}</dd></div>
        <div><dt>Participante</dt><dd>{item.customer?.name || 'Participante'}</dd></div>
        <div><dt>Números</dt><dd>{numbers || '—'}</dd></div>
        <div><dt>Valor confirmado</dt><dd>{amount}</dd></div>
        <div><dt>Data da confirmação</dt><dd>{dateText}</dd></div>
        <div><dt>Protocolo</dt><dd>{item.transactionId}</dd></div>
      </dl>
      <p className="receipt-copyable" aria-label="Texto do comprovante">{receiptText}</p>
      <p className="receipt-share-note">No celular, “Compartilhar imagem” abre o menu do aparelho. Escolha WhatsApp para selecionar o contato e enviar o PNG.</p>
      {copyMessage && <p className="dashboard-dialog__message" role="status">{copyMessage}</p>}
      {receiptImageError && <p className="dashboard-dialog__message" role="status">{receiptImageError}</p>}
      <div className="receipt-actions">
        <button className="dashboard-period" type="button" onClick={shareReceiptImage} disabled={!receiptImage}>Compartilhar imagem</button>
        <button className="dashboard-period" type="button" onClick={downloadReceiptImage} disabled={!receiptImage}>Baixar imagem</button>
        <button className="dashboard-period" type="button" onClick={copyReceipt}>Copiar comprovante</button>
        <a className="dashboard-period" href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp (texto)</a>
        <a className="dashboard-period" href={`mailto:?subject=${emailSubject}&body=${emailBody}`}>Preparar e-mail</a>
        <button className="button" type="button" onClick={() => window.print()}>Imprimir / PDF</button>
      </div>
    </section>
  </div>;
}

async function createDrawReceiptImage(raffle, dateText, winningNumber) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1060;
  const draw = canvas.getContext('2d');
  if (!draw) throw new Error('Não foi possível preparar a imagem do comprovante.');
  draw.fillStyle = '#edf4ef';
  draw.fillRect(0, 0, canvas.width, canvas.height);
  draw.fillStyle = '#ffffff';
  draw.beginPath();
  draw.roundRect(44, 44, 992, 972, 34);
  draw.fill();
  const gradient = draw.createLinearGradient(80, 80, 1000, 280);
  gradient.addColorStop(0, '#17583e');
  gradient.addColorStop(1, '#258054');
  draw.fillStyle = gradient;
  draw.beginPath();
  draw.roundRect(76, 76, 928, 230, 26);
  draw.fill();
  draw.fillStyle = '#ffffff';
  draw.font = '800 58px Arial, sans-serif';
  draw.fillText('RIFOU', 112, 160);
  draw.font = '500 30px Arial, sans-serif';
  draw.fillText('Comprovante de sorteio', 112, 220);

  draw.fillStyle = '#e8f6ec';
  draw.beginPath();
  draw.roundRect(76, 344, 928, 76, 16);
  draw.fill();
  draw.fillStyle = '#23764a';
  draw.font = '700 25px Arial, sans-serif';
  draw.fillText('SORTEIO REALIZADO COM SUCESSO', 104, 392);

  const rows = [
    ['Rifa', raffle.title || 'Rifa RIFOU'],
    ['Número sorteado', winningNumber],
    ['Ganhador', raffle.drawResult?.winnerName || 'Participante'],
    ['Prêmio', formatMoney(Number(raffle.prizeValueInCents || 0) / 100)],
    ['Data e hora do sorteio', dateText],
  ];
  let y = 492;
  for (const [label, value] of rows) {
    draw.fillStyle = '#839087';
    draw.font = '600 22px Arial, sans-serif';
    draw.fillText(label.toLocaleUpperCase('pt-BR'), 104, y);
    y += 42;
    draw.fillStyle = '#263d30';
    draw.font = '600 32px Arial, sans-serif';
    draw.fillText(String(value), 104, y);
    y += 48;
    draw.strokeStyle = '#e8eee9';
    draw.lineWidth = 2;
    draw.beginPath();
    draw.moveTo(104, y + 8);
    draw.lineTo(976, y + 8);
    draw.stroke();
    y += 44;
  }
  draw.fillStyle = '#738278';
  draw.font = '500 20px Arial, sans-serif';
  draw.fillText('Registro oficial do sorteio emitido pelo RIFOU', 104, 962);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Falha ao gerar a imagem do comprovante.')), 'image/png');
  });
  const raffleId = String(raffle.id || 'rifa').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  return new File([blob], `rifou-sorteio-${raffleId}.png`, { type: 'image/png' });
}

function DrawReceipt({ raffle, onClose }) {
  const [shareMessage, setShareMessage] = useState('');
  const [receiptImage, setReceiptImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const result = raffle?.drawResult || {};
  const totalNumbers = Number(raffle?.numberCount || 0);
  const winningNumber = String(result.number || '').padStart(String(totalNumbers).length, '0');
  const parsedDate = result.drawnAt ? new Date(result.drawnAt) : null;
  const dateText = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(parsedDate)
    : 'Data não informada';
  const receiptText = [
    'COMPROVANTE DE SORTEIO — RIFOU',
    'Sorteio realizado com sucesso',
    `Rifa: ${raffle?.title || 'Rifa RIFOU'}`,
    `Número sorteado: ${winningNumber}`,
    `Ganhador: ${result.winnerName || 'Participante'}`,
    `Prêmio: ${formatMoney(Number(raffle?.prizeValueInCents || 0) / 100)}`,
    `Data e hora: ${dateText}`,
  ].join('\n');

  useEffect(() => {
    let active = true;
    createDrawReceiptImage(raffle, dateText, winningNumber)
      .then((file) => { if (active) setReceiptImage(file); })
      .catch(() => { if (active) setImageError('Não foi possível gerar a imagem. Você ainda pode copiar ou imprimir o comprovante.'); });
    return () => { active = false; };
  }, [raffle, dateText, winningNumber]);

  const download = () => {
    if (!receiptImage) return;
    const url = URL.createObjectURL(receiptImage);
    const link = document.createElement('a');
    link.href = url;
    link.download = receiptImage.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const share = async () => {
    if (!receiptImage) return;
    let canShare = false;
    try {
      canShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [receiptImage] });
    } catch { canShare = false; }
    if (canShare) {
      try {
        await navigator.share({ title: `Sorteio RIFOU — ${raffle.title}`, text: `Comprovante do sorteio de ${raffle.title}`, files: [receiptImage] });
        setShareMessage('Comprovante compartilhado.');
      } catch (error) {
        if (error?.name !== 'AbortError') setShareMessage('Não foi possível compartilhar. Baixe a imagem e anexe no aplicativo desejado.');
      }
    } else {
      download();
      setShareMessage('Imagem baixada. Anexe no WhatsApp ou em outro aplicativo.');
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(receiptText); setShareMessage('Comprovante copiado.'); }
    catch { setShareMessage('Não foi possível copiar automaticamente.'); }
  };

  return <div className="dashboard-dialog-backdrop receipt-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dashboard-dialog receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="draw-receipt-title">
      <button className="dashboard-dialog__close receipt-dialog__close" type="button" onClick={onClose} aria-label="Fechar comprovante">×</button>
      <div className="receipt-heading"><span className="brand__mark"><DashIcon name="ticket" size={20} /></span><div><p>Comprovante de sorteio</p><h2 id="draw-receipt-title">RIFOU</h2></div></div>
      <div className="receipt-confirmed"><DashIcon name="check" size={17} /> Sorteio realizado com sucesso</div>
      <dl className="receipt-details">
        <div><dt>Rifa</dt><dd>{raffle?.title || 'Rifa RIFOU'}</dd></div>
        <div><dt>Número sorteado</dt><dd>{winningNumber}</dd></div>
        <div><dt>Ganhador</dt><dd>{result.winnerName || 'Participante'}</dd></div>
        <div><dt>Prêmio</dt><dd>{formatMoney(Number(raffle?.prizeValueInCents || 0) / 100)}</dd></div>
        <div><dt>Data e hora</dt><dd>{dateText}</dd></div>
      </dl>
      <p className="receipt-copyable" aria-label="Texto do comprovante">{receiptText}</p>
      <p className="receipt-share-note">O nome aparece abreviado para proteger os dados do ganhador. No celular, compartilhar abre o menu do aparelho.</p>
      {(shareMessage || imageError) && <p className="dashboard-dialog__message" role="status">{shareMessage || imageError}</p>}
      <div className="receipt-actions">
        <button className="dashboard-period" type="button" onClick={share} disabled={!receiptImage}>Compartilhar imagem</button>
        <button className="dashboard-period" type="button" onClick={download} disabled={!receiptImage}>Baixar imagem</button>
        <button className="dashboard-period" type="button" onClick={copy}>Copiar comprovante</button>
        <a className="dashboard-period" href={`https://wa.me/?text=${encodeURIComponent(receiptText)}`} target="_blank" rel="noreferrer">WhatsApp (texto)</a>
        <a className="dashboard-period" href={`mailto:?subject=${encodeURIComponent(`Comprovante de sorteio RIFOU — ${raffle?.title || ''}`)}&body=${encodeURIComponent(receiptText)}`}>Preparar e-mail</a>
        <button className="button" type="button" onClick={() => window.print()}>Imprimir / PDF</button>
      </div>
    </section>
  </div>;
}

function ParticipantsSection({ raffles, initialRaffleId }) {
  const [raffleId, setRaffleId] = useState(initialRaffleId || raffles[0]?.id || '');
  const [items, setItems] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [actionError, setActionError] = useState('');
  const [savingTransactionId, setSavingTransactionId] = useState('');

  useEffect(() => {
    if (!raffleId || !raffles.some((raffle) => raffle.id === raffleId)) setRaffleId(raffles[0]?.id || '');
  }, [raffleId, raffles]);

  const loadPage = async (append = false) => {
    if (!raffleId) return;
    setLoading(true);
    setError('');
    try {
      const suffix = append && nextToken ? `&nextToken=${encodeURIComponent(nextToken)}` : '';
      const result = await organizerApi(`/api/organizador/raffles/${encodeURIComponent(raffleId)}/transactions?limit=30${suffix}`);
      setItems((current) => append ? [...current, ...(result.items || [])] : (result.items || []));
      setNextToken(result.nextToken || null);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar os participantes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setItems([]);
    setNextToken(null);
    setNotice('');
    if (raffleId) loadPage(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raffleId]);

  const activeRaffle = raffles.find((raffle) => raffle.id === raffleId);
  const filteredItems = items.filter((item) => `${item.customer?.name || ''} ${item.customer?.phone || ''} ${(item.numbers || []).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const dateLabel = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
  const statusLabel = (value) => ({ PENDING: 'Aguardando Pix', CONFIRMED: 'Confirmado', EXPIRED: 'Expirado' }[value] || value);

  const confirmPayment = async () => {
    if (!confirming || confirming.status !== 'PENDING') return;
    setSavingTransactionId(confirming.transactionId);
    setActionError('');
    try {
      const result = await organizerApi(`/api/organizador/raffles/${encodeURIComponent(raffleId)}/transactions/${encodeURIComponent(confirming.transactionId)}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      setConfirming(null);
      setNotice(result.alreadyConfirmed ? 'Este pagamento já havia sido confirmado.' : 'Pagamento confirmado. Os números agora estão registrados como pagos e elegíveis ao sorteio.');
      await loadPage(false);
    } catch (confirmError) {
      setActionError(confirmError.message || 'Não foi possível confirmar este pagamento. Atualize a lista e tente novamente.');
    } finally {
      setSavingTransactionId('');
    }
  };

  return <><DashboardHeading eyebrow="Relacionamento" title="Participantes" description="Consulte reservas e participações vinculadas às suas rifas." />
    {!raffles.length ? <section className="dashboard-card dashboard-empty-state"><DashIcon name="users" size={24} /><strong>Você ainda não tem rifas cadastradas.</strong><p>Crie sua primeira rifa para acompanhar participantes.</p></section> :
      <section className="dashboard-card dashboard-raffles-card"><div className="dashboard-list-toolbar"><div><h2>{activeRaffle?.title || 'Participantes da rifa'}</h2><p>Dados de contato ficam visíveis somente ao proprietário da rifa.</p></div><div className="dashboard-participant-tools"><label className="organizer-field"><span>Rifa</span><select value={raffleId} onChange={(event) => setRaffleId(event.target.value)}>{raffles.map((raffle) => <option value={raffle.id} key={raffle.id}>{raffle.title}</option>)}</select></label><label className="dashboard-search"><DashIcon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, telefone ou número" aria-label="Buscar participante" /></label></div></div>
        {notice && <p className="dashboard-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></p>}
        {error && <p className="organizer-auth__error" role="alert">{error} <button className="dashboard-text-button" type="button" onClick={() => loadPage(false)}>Tentar novamente</button></p>}
        <div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>Participante</th><th>Telefone</th><th>Números</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>{filteredItems.map((item) => <tr key={item.transactionId}><td><strong>{item.customer?.name || 'Participante'}</strong></td><td>{item.customer?.phone || '—'}</td><td>{(item.numbers || []).map((number) => String(number).padStart(2, '0')).join(', ') || '—'}</td><td>{formatMoney(Number(item.amountInCents || 0) / 100)}</td><td><StatusPill status={statusLabel(item.status)} /></td><td>{dateLabel(item.createdAt)}</td><td><div className="dashboard-participant-actions">{item.status === 'PENDING' && <button className="dashboard-row-action" type="button" onClick={() => { setActionError(''); setConfirming(item); }}>Confirmar pagamento</button>}{item.status === 'CONFIRMED' && <button className="dashboard-row-action" type="button" onClick={() => setReceipt(item)}>Ver comprovante</button>}</div></td></tr>)}</tbody></table>{loading && <p className="dashboard-empty">Carregando participações...</p>}{!loading && !filteredItems.length && !error && <p className="dashboard-empty">Nenhuma participação encontrada para esta rifa.</p>}</div>
        {nextToken && <div className="dashboard-load-more"><button className="dashboard-period" type="button" onClick={() => loadPage(true)} disabled={loading}>{loading ? 'Carregando...' : 'Carregar mais'}</button></div>}
      </section>}
    {confirming && <div className="dashboard-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingTransactionId) setConfirming(null); }}><section className="dashboard-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-payment-title"><button className="dashboard-dialog__close" type="button" onClick={() => setConfirming(null)} disabled={Boolean(savingTransactionId)} aria-label="Fechar confirmação">×</button><p className="section-kicker">Ação financeira</p><h2 id="confirm-payment-title">Confirmar pagamento recebido?</h2><p className="dashboard-dialog__description">Confirme somente depois de verificar o recebimento por outro meio. Esta ação registra a participação como paga e libera os números para o sorteio.</p><dl className="dashboard-dialog__summary"><div><dt>Participante</dt><dd>{confirming.customer?.name || 'Participante'}</dd></div><div><dt>Números</dt><dd>{(confirming.numbers || []).map((number) => String(number).padStart(2, '0')).join(', ')}</dd></div><div><dt>Valor</dt><dd>{formatMoney(Number(confirming.amountInCents || 0) / 100)}</dd></div></dl>{actionError && <p className="organizer-auth__error" role="alert">{actionError}</p>}<div className="dashboard-dialog__actions"><button className="dashboard-period" type="button" onClick={() => setConfirming(null)} disabled={Boolean(savingTransactionId)}>Voltar</button><button className="button" type="button" onClick={confirmPayment} disabled={Boolean(savingTransactionId)}>{savingTransactionId ? 'Confirmando...' : 'Confirmar recebimento'}</button></div></section></div>}
    {receipt && <ParticipantReceipt item={receipt} raffleTitle={receipt.raffleTitle || activeRaffle?.title || 'Rifa RIFOU'} onClose={() => setReceipt(null)} />}
  </>;
}

function FinanceSection({ raffles = [] }) {
  const [finance, setFinance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [month, setMonth] = useState(currentMonthValue());
  const [raffleId, setRaffleId] = useState(raffles[0]?.id || '');

  const loadFinance = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterMode === 'month' && month) params.set('month', month);
      if (filterMode === 'raffle' && raffleId) params.set('raffleId', raffleId);
      const result = await organizerApi(`/api/organizador/finance${params.size ? `?${params.toString()}` : ''}`);
      setFinance(result);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar o financeiro.');
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [filterMode, month, raffleId]);

  useEffect(() => {
    loadFinance();
    const refresh = () => {
      if (document.visibilityState === 'visible') loadFinance({ silent: true });
    };
    const interval = window.setInterval(refresh, 10_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [loadFinance]);

  const summary = finance?.summary || {};
  const items = Array.isArray(finance?.items) ? finance.items : [];
  const updatedAt = finance?.updatedAt
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(finance.updatedAt))
    : '';

  return <>
    <DashboardHeading
      eyebrow="Controle financeiro"
      title="Financeiro"
      description="Consulte valores de todas as rifas, de um mês ou de uma campanha específica."
      action={<button className="dashboard-period" type="button" onClick={() => loadFinance()} disabled={loading || refreshing}>{refreshing ? 'Atualizando...' : 'Atualizar'}</button>}
    />
    <section className="dashboard-card dashboard-filter-card"><div className="dashboard-filter-controls">
      <label className="organizer-field"><span>Visualização</span><select value={filterMode} onChange={(event) => setFilterMode(event.target.value)}><option value="all">Todas as rifas</option><option value="month">Por mês</option><option value="raffle">Por rifa</option></select></label>
      {filterMode === 'month' && <label className="organizer-field"><span>Mês</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>}
      {filterMode === 'raffle' && <label className="organizer-field"><span>Rifa</span><select value={raffleId} onChange={(event) => setRaffleId(event.target.value)}>{raffles.map((raffle) => <option value={raffle.id} key={raffle.id}>{raffle.title}</option>)}</select></label>}
    </div></section>
    {error && <p className="organizer-auth__error" role="alert">{error}<button className="dashboard-text-button" type="button" onClick={() => loadFinance()}>Tentar novamente</button></p>}
    {loading && !finance ? <p className="organizer-auth__notice" role="status">Carregando os valores financeiros...</p> : finance ? <>
      <div className="dashboard-stats dashboard-stats--finance">
        <article className="dashboard-stat"><span className="dashboard-stat__icon dashboard-stat__icon--gold"><DashIcon name="clock" size={19} /></span><span className="dashboard-stat__label">Pendente de receber</span><strong>{formatMoney(Number(summary.pendingAmountInCents || 0) / 100)}</strong><small>{Number(summary.reservedNumbers || 0)} números em reserva</small></article>
        <article className="dashboard-stat"><span className="dashboard-stat__icon dashboard-stat__icon--green"><DashIcon name="wallet" size={19} /></span><span className="dashboard-stat__label">Pix confirmado</span><strong>{formatMoney(Number(summary.confirmedRevenueInCents || 0) / 100)}</strong><small>{Number(summary.confirmedNumbers || 0)} números confirmados</small></article>
        <article className="dashboard-stat"><span className="dashboard-stat__icon dashboard-stat__icon--blue"><DashIcon name="check" size={19} /></span><span className="dashboard-stat__label">Números disponíveis</span><strong>{Number(summary.availableNumbers || 0)}</strong><small>Nas {Number(summary.raffleCount || 0)} rifas da conta</small></article>
      </div>
      <section className="dashboard-card dashboard-raffles-card dashboard-finance-card">
        <div className="dashboard-card__heading"><div><h2>{filterMode === 'month' ? 'Movimento do mês' : filterMode === 'raffle' ? 'Financeiro da rifa' : 'Financeiro por rifa'}</h2><p>{filterMode === 'month' ? 'Recebimentos pela data de confirmação e reservas válidas criadas no mês.' : 'Os valores pendentes acompanham as reservas ainda ativas.'}</p></div>{updatedAt && <small className="dashboard-finance-updated">Atualizado às {updatedAt}</small>}</div>
        <div className="dashboard-table-wrap dashboard-finance-table-wrap"><table className="dashboard-table dashboard-finance-table"><thead><tr><th>Rifa</th><th>Por número</th><th>Reservados</th><th>Pendente</th><th>Confirmados</th><th>Recebido</th><th>Disponíveis</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><span className="dashboard-finance-raffle"><strong>{item.title}</strong><StatusPill status={item.status} /></span></td><td>{formatMoney(Number(item.unitPriceInCents || 0) / 100)}</td><td>{Number(item.reservedNumbers || 0)}</td><td className="dashboard-finance-pending">{formatMoney(Number(item.pendingAmountInCents || 0) / 100)}</td><td>{Number(item.confirmedNumbers || 0)}</td><td className="dashboard-finance-confirmed">{formatMoney(Number(item.confirmedRevenueInCents || 0) / 100)}</td><td>{Number(item.availableNumbers || 0)}</td></tr>)}</tbody></table>{!items.length && <p className="dashboard-empty">Você ainda não tem rifas cadastradas.</p>}</div>
        <div className="dashboard-finance-mobile-list">{items.map((item) => <article className="dashboard-finance-mobile-item" key={item.id}><header><div><strong>{item.title}</strong><small>{Number(item.numberCount || 0)} números · {formatMoney(Number(item.unitPriceInCents || 0) / 100)} por número</small></div><StatusPill status={item.status} /></header><dl><div><dt>Reservados</dt><dd>{Number(item.reservedNumbers || 0)}</dd></div><div><dt>Pendente</dt><dd className="dashboard-finance-pending">{formatMoney(Number(item.pendingAmountInCents || 0) / 100)}</dd></div><div><dt>Confirmados</dt><dd>{Number(item.confirmedNumbers || 0)}</dd></div><div><dt>Recebido</dt><dd className="dashboard-finance-confirmed">{formatMoney(Number(item.confirmedRevenueInCents || 0) / 100)}</dd></div><div><dt>Disponíveis</dt><dd>{Number(item.availableNumbers || 0)}</dd></div></dl></article>)}{!items.length && <p className="dashboard-empty">Você ainda não tem rifas cadastradas.</p>}</div>
      </section>
      <section className="dashboard-card dashboard-finance-note"><span><DashIcon name="clock" size={21} /></span><div><h2>Reservas atualizadas automaticamente</h2><p>Os pedidos Pix demonstrativos aparecem como pendentes e mantêm os números bloqueados por até 15 minutos. A tela atualiza a cada 10 segundos. Enquanto o gateway não está integrado, o organizador pode confirmar manualmente o recebimento de uma reserva ainda válida.</p></div></section>
    </> : null}
  </>;
}

const auditActionLabels = {
  RAFFLE_CREATED: 'Rifa criada',
  RAFFLE_UPDATED: 'Rifa editada',
  RAFFLE_STATUS_CHANGED: 'Status alterado',
  FEATURED_RAFFLE_CHANGED: 'Destaque alterado',
  PAYMENT_CONFIRMED_MANUALLY: 'Pagamento confirmado manualmente',
  RAFFLE_DRAWN: 'Sorteio realizado',
  RAFFLE_COMPLETED: 'Rifa concluída automaticamente',
  ORGANIZER_SETTINGS_UPDATED: 'Configuração de rifas atualizada',
  SUPPORT_TICKET_CREATED: 'Chamado de suporte aberto',
};

const supportCategoryLabels = {
  BUG: 'Erro ou falha',
  PAYMENT: 'Pagamento',
  RAFFLE: 'Cadastro ou gestão de rifa',
  ACCOUNT: 'Acesso à conta',
  OTHER: 'Outro assunto',
};

function AuditSection({ raffles }) {
  const [raffleId, setRaffleId] = useState('');
  const [action, setAction] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [items, setItems] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadPage = async (append = false) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (raffleId) params.set('raffleId', raffleId);
      if (action) params.set('action', action);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (append && nextToken) params.set('nextToken', nextToken);
      const result = await organizerApi(`/api/organizador/audit?${params.toString()}`);
      setItems((current) => append ? [...current, ...(result.items || [])] : (result.items || []));
      setNextToken(result.nextToken || null);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar a auditoria.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setItems([]);
    setNextToken(null);
    loadPage(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raffleId, action, fromDate, toDate]);

  const dateLabel = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
      : '—';
  };
  const detailsLabel = (item) => {
    const details = item.details || {};
    const labels = {
      title: 'Nome', description: 'Descrição', image: 'Imagem', imageAlt: 'Texto alternativo',
      prizeValueInCents: 'Prêmio', priceInCents: 'Valor por número', numberCount: 'Quantidade',
      maxNumbersPerUser: 'Limite por participante', drawingDate: 'Data do sorteio',
    };
    const changeLabel = ([field, change]) => {
      const label = labels[field] || field;
      const display = (value) => field === 'prizeValueInCents' || field === 'priceInCents'
        ? formatMoney(Number(value || 0) / 100)
        : String(value ?? '—');
      return `${label}: ${display(change.from)} → ${display(change.to)}`;
    };
    if (item.action === 'RAFFLE_STATUS_CHANGED') {
      const otherChanges = Object.entries(details.changes || {}).filter(([field]) => field !== 'status').map(changeLabel);
      return [`Status: ${details.previousStatus || '—'} → ${details.newStatus || '—'}`, ...otherChanges].join(' · ');
    }
    if (item.action === 'RAFFLE_UPDATED') {
      const changes = details.changes || {};
      return Object.entries(changes).map(changeLabel).join(' · ') || `Campos: ${(details.changedFields || []).join(', ') || 'dados da rifa'}`;
    }
    if (item.action === 'PAYMENT_CONFIRMED_MANUALLY') return `Pedido ${String(details.transactionId || '').slice(0, 8)} · ${(details.numbers || []).map((number) => String(number).padStart(2, '0')).join(', ')} · ${formatMoney(Number(details.amountInCents || 0) / 100)}`;
    if (item.action === 'RAFFLE_DRAWN') return `Número sorteado: ${String(details.winningNumber || '—').padStart(2, '0')}`;
    if (item.action === 'RAFFLE_COMPLETED') return 'A rifa saiu do histórico público após o prazo configurado.';
    if (item.action === 'ORGANIZER_SETTINGS_UPDATED') return `Conclusão automática após ${details.completionDelayDays || '—'} dias.`;
    if (item.action === 'FEATURED_RAFFLE_CHANGED') return details.nextFeaturedRaffleId ? 'Rifa selecionada para destaque na página inicial.' : 'Destaque removido da página inicial.';
    if (item.action === 'SUPPORT_TICKET_CREATED') return `Protocolo ${String(details.ticketId || '').slice(0, 8).toUpperCase()} · ${details.subject || ''}`;
    if (item.action === 'RAFFLE_CREATED') return `Status inicial: ${details.status || '—'}`;
    return '';
  };

  return <><DashboardHeading eyebrow="Rastreabilidade" title="Auditoria" description="Consulte quem fez cada alteração, em qual rifa e quando ela ocorreu." />
    <section className="dashboard-card dashboard-raffles-card">
      <div className="dashboard-audit-filters">
        <label className="organizer-field"><span>Rifa</span><select value={raffleId} onChange={(event) => setRaffleId(event.target.value)}><option value="">Todas as rifas</option>{raffles.map((raffle) => <option value={raffle.id} key={raffle.id}>{raffle.title}</option>)}</select></label>
        <label className="organizer-field"><span>Ação</span><select value={action} onChange={(event) => setAction(event.target.value)}><option value="">Todas as ações</option>{Object.entries(auditActionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="organizer-field"><span>De</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="organizer-field"><span>Até</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
      </div>
      {error && <p className="organizer-auth__error" role="alert">{error} <button className="dashboard-text-button" type="button" onClick={() => loadPage(false)}>Tentar novamente</button></p>}
      <div className="dashboard-table-wrap"><table className="dashboard-table dashboard-audit-table"><thead><tr><th>Quando</th><th>Quem</th><th>Rifa</th><th>O que foi feito</th><th>Detalhes</th></tr></thead><tbody>{items.map((item) => <tr key={item.auditId}><td>{dateLabel(item.occurredAt)}</td><td>{item.actor || 'Organizador'}</td><td>{item.raffleTitle || '—'}</td><td><strong>{auditActionLabels[item.action] || item.action}</strong></td><td>{detailsLabel(item)}</td></tr>)}</tbody></table>{loading && !items.length && <p className="dashboard-empty">Carregando registros de auditoria...</p>}{!loading && !items.length && !error && <p className="dashboard-empty">Nenhuma ação encontrada com esses filtros.</p>}</div>
      {nextToken && <div className="dashboard-load-more"><button className="dashboard-period" type="button" onClick={() => loadPage(true)} disabled={loading}>{loading ? 'Carregando...' : 'Carregar mais'}</button></div>}
    </section>
  </>;
}

function SupportSection({ raffles }) {
  const [tickets, setTickets] = useState([]);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('BUG');
  const [raffleId, setRaffleId] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadTickets = async () => {
    try {
      const result = await organizerApi('/api/organizador/support-tickets?limit=20');
      setTickets(result.items || []);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar seus chamados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTickets(); }, []);

  const submitTicket = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await organizerApi('/api/organizador/support-tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, category, raffleId: raffleId || null, description }),
      });
      const shortId = String(result.item?.ticketId || '').slice(0, 8).toUpperCase();
      setNotice(`Chamado registrado. Protocolo ${shortId}.`);
      setSubject('');
      setDescription('');
      await loadTickets();
    } catch (submitError) {
      setError(submitError.message || 'Não foi possível registrar o chamado.');
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = (value) => value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    : '—';
  const statusText = { OPEN: 'Aberto', IN_PROGRESS: 'Em atendimento', RESOLVED: 'Resolvido', CLOSED: 'Encerrado' };

  return <><DashboardHeading eyebrow="Atendimento RIFOU" title="Suporte" description="Registre um problema e acompanhe o protocolo dos seus chamados." />
    {notice && <p className="dashboard-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></p>}
    {error && <p className="organizer-auth__error" role="alert">{error}</p>}
    <div className="dashboard-support-layout">
      <form className="dashboard-card dashboard-support-form" onSubmit={submitTicket}>
        <h2>Abrir chamado</h2>
        <p>Descreva o que aconteceu. Seu chamado receberá um protocolo para consulta.</p>
        <label className="organizer-field"><span>Assunto</span><input value={subject} onChange={(event) => setSubject(event.target.value)} minLength={5} maxLength={120} placeholder="Ex.: Não consigo confirmar um pagamento" required /></label>
        <div className="dashboard-form-row"><label className="organizer-field"><span>Categoria</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(supportCategoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="organizer-field"><span>Rifa relacionada (opcional)</span><select value={raffleId} onChange={(event) => setRaffleId(event.target.value)}><option value="">Nenhuma</option>{raffles.map((raffle) => <option value={raffle.id} key={raffle.id}>{raffle.title}</option>)}</select></label></div>
        <label className="organizer-field"><span>O que aconteceu?</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={15} maxLength={4000} rows={6} placeholder="Inclua as etapas para reproduzir o problema e o resultado esperado." required /><small>{description.length}/4.000 caracteres</small></label>
        <p className="dashboard-create-form__note">Chamados ficam registrados no painel. O envio automático de e-mail ainda não está integrado.</p>
        <button className="button" type="submit" disabled={saving}>{saving ? 'Registrando...' : 'Enviar chamado'} <DashIcon name="arrow" size={16} /></button>
      </form>
      <section className="dashboard-card dashboard-support-history"><div className="dashboard-card__heading"><div><h2>Meus chamados</h2><p>Histórico dos chamados desta conta.</p></div><button className="dashboard-period" type="button" onClick={loadTickets} disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar'}</button></div>
        {loading ? <p className="dashboard-empty">Carregando chamados...</p> : tickets.length ? tickets.map((ticket) => <article className="dashboard-support-ticket" key={ticket.ticketId}><div className="dashboard-support-ticket__heading"><strong>{ticket.subject}</strong><span className={`dashboard-status dashboard-status--${ticket.status === 'RESOLVED' ? 'success' : 'pending'}`}>{statusText[ticket.status] || ticket.status}</span></div><p>{supportCategoryLabels[ticket.category] || ticket.category}{ticket.raffleTitle ? ` · ${ticket.raffleTitle}` : ''}</p><small>Protocolo {String(ticket.ticketId).slice(0, 8).toUpperCase()} · {dateLabel(ticket.createdAt)}</small><details><summary>Ver descrição</summary><p>{ticket.description}</p></details></article>) : <p className="dashboard-empty">Você ainda não abriu chamados.</p>}
      </section>
    </div>
  </>;
}

function SettingsSection({ user, setNotice, onProfileUpdated }) {
  const [profile, setProfile] = useState({ name: user?.name || '', email: user?.email || '', phone: '', phoneVerified: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [phoneVerificationRequired, setPhoneVerificationRequired] = useState(false);
  const [completionDelayDays, setCompletionDelayDays] = useState(30);
  const [loadingRaffleSettings, setLoadingRaffleSettings] = useState(true);
  const [savingRaffleSettings, setSavingRaffleSettings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    organizerApi('/api/organizador/profile')
      .then((result) => { if (!cancelled && result.profile) setProfile(result.profile); })
      .catch((error) => { if (!cancelled) setNotice(error.message || 'Não foi possível carregar o perfil.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [setNotice]);

  useEffect(() => {
    let cancelled = false;
    organizerApi('/api/organizador/settings/raffles')
      .then((result) => {
        if (!cancelled) setCompletionDelayDays(Number(result.settings?.completionDelayDays || 30));
      })
      .catch((error) => { if (!cancelled) setNotice(error.message || 'Não foi possível carregar as configurações das rifas.'); })
      .finally(() => { if (!cancelled) setLoadingRaffleSettings(false); });
    return () => { cancelled = true; };
  }, [setNotice]);

  const saveProfile = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setNotice('');
    try {
      const result = await organizerApi('/api/organizador/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: data.get('name'), phone: data.get('phone') }),
      });
      setProfile(result.profile || profile);
      onProfileUpdated?.({ name: result.profile?.name || profile.name, email: result.profile?.email || profile.email });
      setPhoneVerificationRequired(Boolean(result.phoneVerificationRequired));
      setNotice(result.phoneVerificationRequired
        ? 'Perfil salvo. Enviamos um código por SMS para verificar o novo telefone.'
        : 'Perfil atualizado.');
    } catch (error) {
      setNotice(error.message || 'Não foi possível atualizar o perfil.');
    } finally {
      setSaving(false);
    }
  };

  const verifyPhone = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const result = await postJson('/api/organizador/profile/verify-phone', { code: verificationCode });
      setProfile(result.profile || profile);
      onProfileUpdated?.({ name: result.profile?.name || profile.name, email: result.profile?.email || profile.email });
      setPhoneVerificationRequired(false);
      setVerificationCode('');
      setNotice(result.verified ? 'Telefone verificado.' : 'O Cognito ainda não confirmou o telefone.');
    } catch (error) {
      setNotice(error.message || 'Não foi possível verificar o telefone.');
    } finally {
      setSaving(false);
    }
  };

  const saveRaffleSettings = async (event) => {
    event.preventDefault();
    const days = Number(completionDelayDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setNotice('Informe um prazo entre 1 e 365 dias.');
      return;
    }
    setSavingRaffleSettings(true);
    setNotice('');
    try {
      const result = await organizerApi('/api/organizador/settings/raffles', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completionDelayDays: days }),
      });
      setCompletionDelayDays(Number(result.settings?.completionDelayDays || days));
      setNotice('Configuração de conclusão das rifas atualizada.');
    } catch (error) {
      setNotice(error.message || 'Não foi possível salvar as configurações das rifas.');
    } finally {
      setSavingRaffleSettings(false);
    }
  };

  return <>
    <DashboardHeading eyebrow="Sua conta" title="Configurações" description="Atualize os dados da conta e as regras de ciclo de vida das rifas." />
    <div className="dashboard-settings-grid">
      <form className="dashboard-card dashboard-settings-card" onSubmit={saveProfile}>
        <h2>Perfil do organizador</h2>
        <p>O e-mail de acesso é gerenciado pelo administrador e não pode ser alterado por aqui.</p>
        <label className="organizer-field"><span>Nome</span><input name="name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} minLength={2} maxLength={120} required disabled={loading} /></label>
        <label className="organizer-field"><span>E-mail</span><input type="email" value={profile.email} readOnly /></label>
        <label className="organizer-field"><span>WhatsApp com DDD</span><input name="phone" type="tel" inputMode="tel" value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} placeholder="(11) 99999-9999" disabled={loading} /></label>
        {profile.phone && <small className={profile.phoneVerified ? 'dashboard-profile-verified' : 'dashboard-profile-unverified'}>{profile.phoneVerified ? 'Telefone verificado' : 'Telefone ainda não verificado'}</small>}
        <button className="button" type="submit" disabled={loading || saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
      </form>
      <form className="dashboard-card dashboard-settings-card" onSubmit={saveRaffleSettings}>
        <h2>Conclusão automática das rifas</h2>
        <p>Depois do sorteio, a campanha continua visível no histórico público pelo prazo configurado. Ao final, passa para Concluída e fica privada, disponível apenas no painel do criador.</p>
        <label className="organizer-field"><span>Concluir após o sorteio (dias)</span><input type="number" min="1" max="365" value={completionDelayDays} onChange={(event) => setCompletionDelayDays(event.target.value)} required disabled={loadingRaffleSettings} /><small>Defina de 1 a 365 dias. Alterações futuras não mudam prazos já gravados. Rifas sorteadas antes desta rotina serão programadas na primeira execução.</small></label>
        <button className="button" type="submit" disabled={loadingRaffleSettings || savingRaffleSettings}>{savingRaffleSettings ? 'Salvando...' : 'Salvar configuração'}</button>
      </form>
      <section className="dashboard-card dashboard-settings-card">
        <h2>Segurança da conta</h2><p>Login e recuperação de senha são protegidos pelo Cognito.</p>
        {phoneVerificationRequired ? <form className="dashboard-verification-form" onSubmit={verifyPhone}><label className="organizer-field"><span>Código enviado por SMS</span><input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" minLength={4} maxLength={8} required /></label><button className="button" type="submit" disabled={saving}>{saving ? 'Verificando...' : 'Confirmar telefone'}</button></form> : <div className="dashboard-security-links"><a href="/organizador/recuperar-senha">Alterar senha</a><small>Para mudar a senha, confirme sua identidade pelo fluxo de recuperação.</small></div>}
        <div className="dashboard-profile-note"><strong>Dados protegidos</strong><small>O perfil é atualizado diretamente no Cognito; seus tokens permanecem em cookies HttpOnly.</small></div>
      </section>
    </div>
  </>;
}

function CreateRaffleSection({ raffle, onSubmit, onCancel, saving }) {
  const unitPriceInCents = raffle ? Number(raffle.priceInCents || 0) : 1000;
  const numberCount = raffle?.numberCount || 100;
  const initialPrizeValueInCents = Number(raffle?.prizeValueInCents) || unitPriceInCents * numberCount;
  const financialsLocked = Boolean(raffle?.financialsLocked);
  const raffleStatusValue = ({ Ativa: 'ACTIVE', Rascunho: 'DRAFT', Inativa: 'INACTIVE', Sorteada: 'DRAWN' })[raffle?.status] || 'DRAFT';
  const [prizeValueValue, setPrizeValueValue] = useState(formatCurrencyField(initialPrizeValueInCents));
  const [unitPriceValue, setUnitPriceValue] = useState(formatCurrencyField(unitPriceInCents));
  const [numberCountValue, setNumberCountValue] = useState(String(numberCount));
  const [formStatus, setFormStatus] = useState(raffleStatusValue);
  const [featuredValue, setFeaturedValue] = useState(Boolean(raffle?.featured));
  const [selectedImageName, setSelectedImageName] = useState('');
  const [pricingError, setPricingError] = useState('');
  const calculatedUnitPriceInCents = parseCurrencyToCents(unitPriceValue);
  const parsedNumberCount = Number(numberCountValue);
  const lockedUnitPriceInCents = Number(raffle?.priceInCents || 0);
  const lockedNumberCount = Number(raffle?.numberCount || numberCount);
  const currentUnitPriceInCents = financialsLocked ? lockedUnitPriceInCents : calculatedUnitPriceInCents;
  const currentNumberCount = financialsLocked ? lockedNumberCount : parsedNumberCount;
  const currentNumberCountValue = String(currentNumberCount);
  const prizeValueInCents = financialsLocked
    ? lockedUnitPriceInCents * lockedNumberCount
    : parseCurrencyToCents(prizeValueValue);
  const updateStatus = (value) => {
    setFormStatus(value);
    if (value !== 'ACTIVE') setFeaturedValue(false);
  };
  const formatUnitPrice = () => setUnitPriceValue(formatCurrencyField(parseCurrencyToCents(unitPriceValue)));
  const formatPrizeValue = () => setPrizeValueValue(formatCurrencyField(parseCurrencyToCents(prizeValueValue)));
  const updatePrizeValue = (value) => {
    setPrizeValueValue(value);
    const totalInCents = parseCurrencyToCents(value);
    const quantity = Number(numberCountValue);
    if (Number.isSafeInteger(quantity) && quantity > 0 && totalInCents > 0 && totalInCents % quantity === 0) {
      setUnitPriceValue(formatCurrencyField(totalInCents / quantity));
      setPricingError('');
    } else {
      setPricingError('O valor do prêmio precisa ser divisível pela quantidade de números em centavos.');
    }
  };
  const updateUnitPrice = (value) => {
    setUnitPriceValue(value);
    const unitInCents = parseCurrencyToCents(value);
    const totalInCents = parseCurrencyToCents(prizeValueValue);
    if (unitInCents > 0 && totalInCents > 0 && totalInCents % unitInCents === 0) {
      const quantity = totalInCents / unitInCents;
      if (Number.isSafeInteger(quantity) && quantity >= 10 && quantity <= 1_000_000) {
        setNumberCountValue(String(quantity));
        setPricingError('');
        return;
      }
    }
    setPricingError('Esse valor por número precisa formar uma quantidade inteira entre 10 e 1.000.000 para o prêmio atual.');
  };
  const updateNumberCount = (value) => {
    setNumberCountValue(value);
    const quantity = Number(value);
    const totalInCents = parseCurrencyToCents(prizeValueValue);
    if (Number.isSafeInteger(quantity) && quantity > 0 && totalInCents > 0 && totalInCents % quantity === 0) {
      setUnitPriceValue(formatCurrencyField(totalInCents / quantity));
      setPricingError('');
    } else {
      setPricingError('A quantidade precisa dividir o valor do prêmio em centavos.');
    }
  };

  return <><DashboardHeading eyebrow={raffle ? 'Editar campanha' : 'Nova campanha'} title={raffle ? 'Editar rifa' : 'Criar rifa'} description="Cadastre e mantenha atualizadas as informações da sua campanha." /><form className="dashboard-card dashboard-create-form" onSubmit={onSubmit}>
    <label className="organizer-field"><span>Nome da rifa</span><input name="title" defaultValue={raffle?.title || ''} placeholder="Ex.: Smartphone Pro 256 GB" minLength={4} maxLength={120} required /></label>
    <label className="organizer-field"><span>Descrição</span><textarea name="description" defaultValue={raffle?.description || ''} placeholder="Descreva o prêmio e as informações da campanha." minLength={4} maxLength={2000} rows={4} required /></label>
    {financialsLocked && <p className="dashboard-create-form__locked-note">A primeira reserva bloqueou o valor total, o preço por número e a quantidade. Esses dados permanecem travados mesmo depois que uma reserva expira; descrição, imagem e destaque podem ser atualizados.</p>}
    <div className="dashboard-form-row">
      <label className="organizer-field"><span>Valor total do prêmio</span>{financialsLocked ? <><CurrencyControl value={formatCurrencyField(prizeValueInCents)} disabled /><input type="hidden" name="prizeValue" value={formatCurrencyField(prizeValueInCents)} /><small>Travado após a primeira reserva.</small></> : <><CurrencyControl name="prizeValue" value={prizeValueValue} onChange={updatePrizeValue} onBlur={formatPrizeValue} required /><small>Ao alterar o prêmio, o valor por número é recalculado.</small></>}</label>
      <label className="organizer-field"><span>Valor por número</span>{financialsLocked ? <><CurrencyControl value={formatCurrencyField(lockedUnitPriceInCents)} disabled /><input type="hidden" name="price" value={formatCurrencyField(lockedUnitPriceInCents)} /><small>Travado após a primeira reserva.</small></> : <><CurrencyControl name="price" value={unitPriceValue} onChange={updateUnitPrice} onBlur={formatUnitPrice} required /><small>Ao alterar este valor, a quantidade é recalculada para fechar o prêmio.</small></>}</label>
    </div>
    {pricingError && !financialsLocked && <p className="dashboard-create-form__locked-note dashboard-create-form__validation" role="alert">{pricingError}</p>}
    <label className="organizer-field"><span>Quantidade de números</span>{financialsLocked ? <><input type="number" value={currentNumberCountValue} disabled /><input type="hidden" name="numbers" value={currentNumberCountValue} /><small>Travada após a primeira reserva.</small></> : <input name="numbers" type="number" min="10" max="1000000" value={numberCountValue} onChange={(event) => updateNumberCount(event.target.value)} required />}</label>
    <label className="organizer-field"><span>Máximo de números por participante</span><input name="maxNumbersPerUser" type="number" min="1" max="97" defaultValue={raffle?.maxNumbersPerUser || 2} required /><small>Limite acumulado por telefone nesta rifa, incluindo reservas e compras confirmadas. Não pode superar a quantidade de números.</small></label>
    <label className="organizer-field"><span>Imagem do prêmio</span><span className="dashboard-image-upload"><input className="dashboard-image-upload__input" aria-label="Selecionar imagem do prêmio" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setSelectedImageName(event.target.files?.[0]?.name || '')} required={!raffle?.image} /><span className="dashboard-image-upload__icon"><DashIcon name="upload" size={20} /></span><span className="dashboard-image-upload__copy"><strong>{selectedImageName || (raffle?.image ? 'Substituir imagem atual' : 'Escolha uma imagem para o prêmio')}</strong><small>{selectedImageName ? 'Arquivo selecionado. Clique para trocar.' : 'JPG, PNG, WebP ou AVIF · até 5 MB'}</small></span><span className="dashboard-image-upload__button">{selectedImageName ? 'Trocar imagem' : 'Escolher arquivo'}</span></span>{raffle?.image && <><input type="hidden" name="image" defaultValue={raffle.image} /><img className="dashboard-image-preview" src={raffle.image} alt={raffle.imageAlt || ''} /></>}</label>
    <label className="organizer-field"><span>Texto alternativo da imagem</span><input name="imageAlt" type="text" defaultValue={raffle?.imageAlt || ''} maxLength={200} placeholder="Descrição da imagem" /></label>
    <label className="dashboard-featured-option"><input name="featured" type="checkbox" checked={featuredValue} onChange={(event) => setFeaturedValue(event.target.checked)} disabled={Boolean(raffle?.drawResult)} /><span><strong>Colocar esta rifa em destaque na página inicial</strong><small>O destaque é único para o site e substitui a rifa atualmente selecionada. Somente rifas ativas podem ficar em destaque.</small></span></label>
    <div className="dashboard-form-row"><label className="organizer-field"><span>Data prevista do sorteio</span><input name="date" type="date" defaultValue={raffle?.drawingDate || ''} /></label><label className="organizer-field"><span>Status</span><select name="status" value={formStatus} onChange={(event) => updateStatus(event.target.value)}><option value="DRAFT" disabled={Boolean(raffle?.drawResult)}>Rascunho</option><option value="ACTIVE" disabled={Boolean(raffle?.drawResult)}>Ativa e pública</option><option value="INACTIVE">Inativa</option>{raffle?.drawResult && <option value="DRAWN">Sorteada</option>}</select>{raffle?.drawResult && <small>Uma rifa sorteada não pode ser reativada. Você pode mantê-la no histórico ou inativá-la.</small>}</label></div>
    <p className="dashboard-create-form__note">Ao escolher “Ativa e pública”, a rifa aparece no catálogo. Após a primeira reserva, o preço e a quantidade ficam travados permanentemente.</p>
    <div className="dashboard-create-form__actions"><button className="dashboard-period" type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button className="button" type="submit" disabled={saving || Boolean(pricingError)}>{saving ? 'Salvando...' : <><DashIcon name={raffle ? 'check' : 'plus'} size={17} /> {raffle ? 'Salvar alterações' : 'Criar rifa'}</>}</button></div>
  </form></>;
}

export default function OrganizerRoutes({ currentPath }) {
  const [sessionState, setSessionState] = useState('checking');
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (currentPath !== '/organizador/dashboard') {
      setSessionState('idle');
      setUser(null);
      return undefined;
    }

    let cancelled = false;
    setSessionState('checking');
    fetch('/api/organizador/auth/session', { cache: 'no-store' })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        if (response.status === 401 || payload.authenticated !== true) {
          setSessionState('signed-out');
          return;
        }
        if (!response.ok) throw new Error(payload.message || 'Não foi possível validar sua sessão.');
        setUser(payload.user || null);
        setSessionState('signed-in');
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Não foi possível validar a sessão do organizador.', error);
        setSessionState('error');
      });

    return () => { cancelled = true; };
  }, [currentPath]);

  if (currentPath === '/organizador/recuperar-senha') return <RecoverAccess />;
  if (currentPath === '/organizador/solicitar-acesso') return <RequestOrganizerAccess />;
  if (currentPath === '/organizador/dashboard') {
    if (sessionState === 'checking' || sessionState === 'idle') {
      return <AuthLayout><p className="organizer-auth__notice" role="status">Verificando seu acesso...</p></AuthLayout>;
    }
    if (sessionState === 'error') {
      return <AuthLayout><p className="organizer-auth__error" role="alert">Não foi possível validar sua sessão agora.</p><button className="button button--full organizer-auth__submit" type="button" onClick={() => window.location.reload()}>Tentar novamente</button></AuthLayout>;
    }
    if (sessionState !== 'signed-in') return <OrganizerLogin forcedMessage="Entre com sua conta aprovada para acessar o painel." />;
    return <OrganizerDashboard user={user} onUserUpdate={(profile) => setUser((current) => ({ ...current, ...profile }))} />;
  }
  return <OrganizerLogin />;
}
