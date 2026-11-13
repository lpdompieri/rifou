'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { createPixOrder } from './services/pixOrdersApi.js';
import OrganizerRoutes from './OrganizerApp.jsx';

const demoRaffles = [
  {
    id: 'relogio',
    image: '/images/watch.avif',
    imageAlt: 'Relógio premium com pulseira em aço',
    organizer: 'Carlos Mendes',
    title: 'Relógio Premium Classic',
    description: 'Um clássico atemporal em aço inoxidável, vidro de safira e movimento automático. Novo, original e com garantia.',
    prizeValue: '1.000,00',
    price: '10,00',
    numbers: '100',
    drawingDate: '28 Jun, 2025',
    drawingDateLong: '28 de junho, 2025',
    sold: 30,
    cardSold: 65,
    reserved: 13,
    confirmed: 17,
  },
  {
    id: 'headphone',
    image: '/images/headphones.avif',
    imageAlt: 'Headphone preto de alta qualidade',
    organizer: 'Marina Alves',
    title: 'Headphone Air Pro Max',
    description: 'Uma oportunidade de concorrer ao Headphone Air Pro Max. Confira o andamento da rifa e escolha seus números da sorte.',
    prizeValue: 'A confirmar',
    price: '15,00',
    numbers: '150',
    drawingDate: '05 Jul, 2025',
    drawingDateLong: '05 de julho, 2025',
    sold: 48,
    reserved: 18,
    confirmed: 54,
  },
  {
    id: 'smartphone',
    image: '/images/smartphone.avif',
    imageAlt: 'Smartphone premium em tom laranja',
    organizer: 'André Ribeiro',
    title: 'Smartphone Pro 256 GB',
    description: 'Uma oportunidade de concorrer ao Smartphone Pro 256 GB. Confira o andamento da rifa e escolha seus números da sorte.',
    prizeValue: 'A confirmar',
    price: '25,00',
    numbers: '200',
    drawingDate: '12 Jul, 2025',
    drawingDateLong: '12 de julho, 2025',
    sold: 72,
    reserved: 30,
    confirmed: 114,
  },
];

const steps = [
  {
    number: '01',
    title: 'Escolha sua rifa',
    description: 'Explore prêmios incríveis e encontre sua próxima conquista.',
    icon: 'search',
  },
  {
    number: '02',
    title: 'Selecione os números',
    description: 'Escolha quantos números quiser e veja o valor em tempo real.',
    icon: 'grid',
  },
  {
    number: '03',
    title: 'Pague com Pix',
    description: 'Pagamento rápido e confirmação automática e segura.',
    icon: 'check',
  },
];

function Icon({ name, size = 20, className = '' }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    className,
  };

  if (name === 'ticket') {
    return (
      <svg {...common}>
        <path d="M2 9a3 3 0 0 0 0 6v3h20v-3a3 3 0 0 0 0-6V6H2v3Z" />
        <path d="M13 6v12" />
      </svg>
    );
  }
  if (name === 'shield') {
    return (
      <svg {...common}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (name === 'eye') {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }
  if (name === 'search') {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
    );
  }
  if (name === 'grid') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }
  if (name === 'check') {
    return (
      <svg {...common}>
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }
  if (name === 'calendar') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </svg>
    );
  }
  if (name === 'arrow') {
    return (
      <svg {...common}>
        <path d="m9 18 6-6-6-6" />
      </svg>
    );
  }
  if (name === 'menu') {
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  }
  return null;
}

function Brand({ light = false }) {
  return (
    <a className={`brand${light ? ' brand--light' : ''}`} href="/" aria-label="RIFOU, página inicial">
      <span className="brand__mark"><Icon name="ticket" size={21} /></span>
      <span className="brand__word">RIFOU</span>
    </a>
  );
}

function Progress({ value, compact = false }) {
  return (
    <div className={`progress${compact ? ' progress--compact' : ''}`}>
      <div className="progress__labels">
        <strong>{value}% arrecadado</strong>
        <span>{100 - value}% restante</span>
      </div>
      <div
        className="progress__track"
        role="progressbar"
        aria-label={`${value}% arrecadado`}
        aria-valuenow={value}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function RaffleCard({ raffle }) {
  const detailUrl = `/rifas/${raffle.id}`;

  return (
    <article className="raffle-card">
      <a className="raffle-card__image-wrap" href={detailUrl} aria-label={`Ver detalhes: ${raffle.title}`}>
        <img src={raffle.image} alt={raffle.imageAlt} className="raffle-card__image" />
        <span className="raffle-card__badge">Ativa</span>
      </a>
      <div className="raffle-card__body">
        <p className="raffle-card__organizer">{raffle.organizer}</p>
        <h3><a href={detailUrl}>{raffle.title}</a></h3>
        <div className="raffle-card__details">
          <div>
            <span>Por número</span>
            <strong>R$ {raffle.price}</strong>
          </div>
          <div>
            <span>Números</span>
            <strong>{raffle.numbers}</strong>
          </div>
          <div>
            <span>Sorteio</span>
            <strong>{raffle.drawingDate}</strong>
          </div>
        </div>
        <Progress value={raffle.cardSold ?? raffle.sold} compact />
        <a className="button button--full" href={detailUrl}>
          Ver rifa <Icon name="arrow" size={18} />
        </a>
      </div>
    </article>
  );
}

function formatDrawDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function DrawnRaffleCard({ raffle }) {
  const numberWidth = String(raffle.numbers || 1).length;
  const drawResult = raffle.drawResult || {};
  return <article className="raffle-history-card">
    <a href={`/rifas/${raffle.id}`} className="raffle-history-card__image" aria-label={`Ver resultado: ${raffle.title}`}>
      <img src={raffle.image} alt={raffle.imageAlt || raffle.title} />
      <span>Rifa sorteada</span>
    </a>
    <div className="raffle-history-card__body">
      <p className="section-kicker">Sorteio realizado</p>
      <h3><a href={`/rifas/${raffle.id}`}>{raffle.title}</a></h3>
      <div className="raffle-history-card__result"><span>Número sorteado</span><strong>{String(drawResult.number || 0).padStart(numberWidth, '0')}</strong></div>
      <p className="raffle-history-card__winner">Ganhador: <strong>{drawResult.winnerName || 'Participante'}</strong></p>
      <small>{formatDrawDateTime(drawResult.drawnAt)}</small>
      <a className="text-link raffle-history-card__link" href={`/rifas/${raffle.id}`}>Ver resultado <Icon name="arrow" size={16} /></a>
    </div>
  </article>;
}

function DrawnRafflesSection({ raffles, compact = false }) {
  if (!raffles.length) return null;
  return <section id="rifas-sorteadas" className={`raffle-history-section section${compact ? ' raffle-history-section--compact' : ''}`}>
    <div className="container">
      <div className="section-heading section-heading--row"><div><p className="section-kicker">Transparência RIFOU</p><h2>Rifas já sorteadas</h2><p>Confira os resultados dos sorteios realizados.</p></div>{compact && <a className="section-heading__link" href="/rifas#rifas-sorteadas">Ver todo o histórico <Icon name="arrow" size={16} /></a>}</div>
      <div className="raffle-history-grid">{raffles.map((raffle) => <DrawnRaffleCard key={raffle.id} raffle={raffle} />)}</div>
    </div>
  </section>;
}

function Header({ menuOpen, setMenuOpen }) {
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <div className="container header__inner">
        <Brand />
        <button
          className="header__menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Icon name="menu" size={22} />
        </button>
        <nav className={`main-nav${menuOpen ? ' main-nav--open' : ''}`} aria-label="Navegação principal">
          <a href="/" onClick={closeMenu}>Início</a>
          <a href="/rifas" onClick={closeMenu}>Rifas ativas</a>
          <a href="/#como-funciona" onClick={closeMenu}>Como funciona</a>
          <a className="main-nav__login" href="/organizador/login" onClick={closeMenu}>Entrar</a>
          <a className="button button--small" href="/rifas" onClick={closeMenu}>Ver rifas</a>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter({ showNotice }) {
  return (
    <footer className="site-footer" id="contato">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Brand light />
            <p>Rifas transparentes, participações simples e momentos inesquecíveis.</p>
          </div>
          <div className="footer-column">
            <h2>Plataforma</h2>
            <a href="/rifas">Rifas ativas</a>
            <a href="/#como-funciona">Como funciona</a>
            <button type="button" onClick={() => showNotice('Mais informações sobre segurança em breve.')}>Segurança</button>
          </div>
          <div className="footer-column">
            <h2>Organizadores</h2>
            <a href="/organizador/login">Entrar</a>
            <a href="/organizador/solicitar-acesso">Quero organizar</a>
            <a href="mailto:suporte@rifou.com.br">Central de ajuda</a>
          </div>
          <div className="footer-column footer-column--contact">
            <h2>Fale com a gente</h2>
            <a href="mailto:suporte@rifou.com.br">suporte@rifou.com.br</a>
            <p>Seg–Sex, 9h às 18h</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} RIFOU. Todos os direitos reservados.</p>
          <div>
            <button type="button" onClick={() => showNotice('Os termos de uso serão publicados em breve.')}>Termos de uso</button>
            <span>·</span>
            <button type="button" onClick={() => showNotice('A política de privacidade será publicada em breve.')}>Privacidade</button>
          </div>
        </div>
      </div>
    </footer>
  );
}

function RafflesPage({ raffles, drawnRaffles }) {
  return (
    <main className="catalog-page">
      <div className="container">
        <nav className="breadcrumbs" aria-label="Navegação estrutural">
          <a href="/">Início</a><Icon name="arrow" size={14} /><span>Rifas ativas</span>
        </nav>
        <section className="catalog-heading">
          <div>
            <p className="section-kicker">Oportunidades RIFOU</p>
            <h1>Rifas ativas</h1>
            <p>Encontre seu próximo prêmio e acompanhe cada etapa com transparência.</p>
          </div>
          <span className="catalog-heading__count">{raffles.length} rifas disponíveis</span>
        </section>
        {raffles.length ? (
          <div className="raffle-grid">
            {raffles.map((raffle) => <RaffleCard key={raffle.id} raffle={raffle} />)}
          </div>
        ) : (
          <p className="raffles-empty">Não há rifas ativas no momento. Volte em breve para conferir novas oportunidades.</p>
        )}
      </div>
      <DrawnRafflesSection raffles={drawnRaffles} />
    </main>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatBrazilPhone(value) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;

  const subscriberSplit = digits.length === 11 ? 7 : 6;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, subscriberSplit)}-${digits.slice(subscriberSplit)}`;
}

function CheckoutProgress({ activeStep }) {
  const steps = ['Escolha', 'Identificação', 'Pagamento'];

  return (
    <nav className="checkout-progress" aria-label="Etapas da participação">
      {steps.map((label, index) => {
        const step = index + 1;
        const complete = step < activeStep;
        const active = step === activeStep;
        return (
          <div className={`checkout-progress__step${active ? ' checkout-progress__step--active' : ''}${complete ? ' checkout-progress__step--complete' : ''}`} key={label} aria-current={active ? 'step' : undefined}>
            <span>{complete ? <Icon name="check" size={13} /> : step}</span>
            <strong>{label}</strong>
          </div>
        );
      })}
    </nav>
  );
}

function ParticipationSummary({ raffle, selectedNumbers, total }) {
  const orderedNumbers = [...selectedNumbers].sort((first, second) => first - second);

  return (
    <aside className="participation-summary">
      <h2>Resumo da participação</h2>
      <div className="participation-summary__raffle">
        <img src={raffle.image} alt="" />
        <div><strong>{raffle.title}</strong><span>por {raffle.organizer}</span></div>
      </div>
      <div className="participation-summary__numbers-heading"><span>Números escolhidos</span><strong>{orderedNumbers.length}</strong></div>
      <div className="participation-summary__number-list">
        {orderedNumbers.map((number) => <span key={number}>{String(number).padStart(2, '0')}</span>)}
      </div>
      <div className="participation-summary__unit"><span>Valor por número</span><strong>R$ {raffle.price}</strong></div>
      <div className="participation-summary__total"><span>Total a pagar</span><strong>{formatCurrency(total)}</strong></div>
    </aside>
  );
}

function RaffleDetailsPage({ raffle, showNotice }) {
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [raffleNumbers, setRaffleNumbers] = useState({});
  const lastLoadedNumbersPage = useRef(null);
  const [numberSummary, setNumberSummary] = useState(null);
  const [numberRequest, setNumberRequest] = useState({ status: 'loading' });
  const [numberRetryKey, setNumberRetryKey] = useState(0);
  const [checkoutStep, setCheckoutStep] = useState('details');
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [formError, setFormError] = useState('');
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [pixOrder, setPixOrder] = useState(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  const totalNumbers = Number(raffle.numbers);
  const maxNumbersPerUser = Number(raffle.maxNumbersPerUser || Math.min(97, totalNumbers));
  const pageSize = 30;
  const pageCount = Math.ceil(totalNumbers / pageSize);
  const firstNumber = currentPage * pageSize + 1;
  const lastNumber = Math.min(firstNumber + pageSize - 1, totalNumbers);
  const visibleNumbers = Array.from({ length: lastNumber - firstNumber + 1 }, (_, index) => firstNumber + index);
  const numberStatuses = raffleNumbers;
  const numberStatusCounts = {
    available: Number(numberSummary?.availableCount || 0),
    reserved: Number(numberSummary?.reservedCount || 0),
    confirmed: Number(numberSummary?.confirmedCount || 0),
  };
  const availableNumbers = numberStatusCounts.available;
  const price = Number(raffle.price.replace(',', '.'));
  const totalValue = totalNumbers * price;
  const raisedValue = Number(raffle.confirmed || 0) * price;
  const leftToRaise = totalValue - raisedValue;
  const selectedNumbersValue = selectedNumbers.length * price;
  const organizerInitials = raffle.organizer.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase();
  const remainingSeconds = pixOrder ? Math.max(0, Math.ceil((pixOrder.expiresAt - now) / 1000)) : 0;
  const countdownLabel = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (checkoutStep !== 'pix' || !pixOrder) return undefined;

    const updateCountdown = () => setNow(Date.now());
    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [checkoutStep, pixOrder]);

  useEffect(() => {
    if (raffle.status !== 'ACTIVE') return undefined;
    const controller = new AbortController();
    const loadNumbers = async () => {
      const from = currentPage * pageSize + 1;
      const limit = Math.min(pageSize, totalNumbers - from + 1);
      const pageKey = `${raffle.id}:${currentPage}`;
      const sameLoadedPage = lastLoadedNumbersPage.current === pageKey;
      setNumberRequest((current) => current.status === 'ready' && sameLoadedPage
        ? { ...current, refreshing: true, refreshError: false }
        : { status: 'loading' });
      try {
        const response = await fetch(`/api/raffles/${encodeURIComponent(raffle.id)}/numbers?from=${from}&limit=${limit}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Falha ao buscar os números.');
        if (!Array.isArray(payload.items) || payload.items.length !== limit) {
          throw new Error('A resposta de disponibilidade dos números está incompleta.');
        }

        const pageStatuses = {};
        payload.items.forEach((item) => {
          const number = Number(item.number);
          const status = String(item.status || '').toLowerCase();
          if (!Number.isInteger(number) || number < from || number > from + limit - 1
            || !['available', 'reserved', 'confirmed'].includes(status)) {
            throw new Error('A resposta de disponibilidade dos números é inválida.');
          }
          pageStatuses[number] = status;
        });
        setRaffleNumbers((current) => ({ ...current, ...pageStatuses }));
        setNumberSummary({
          availableCount: payload.availableCount,
          reservedCount: payload.reservedCount,
          confirmedCount: payload.confirmedCount,
        });
        setSelectedNumbers((current) => current.filter((number) => (
          number < from || number > from + limit - 1 || pageStatuses[number] === 'available'
        )));
        lastLoadedNumbersPage.current = pageKey;
        setNumberRequest({ status: 'ready', refreshing: false, refreshError: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Não foi possível carregar os números da rifa.', error);
        setNumberRequest((current) => current.status === 'ready' && sameLoadedPage
          ? { ...current, refreshing: false, refreshError: true }
          : { status: 'error' });
      }
    };

    loadNumbers();
    return () => controller.abort();
  }, [raffle.id, raffle.status, currentPage, totalNumbers, pageSize, numberRetryKey]);

  useEffect(() => {
    if (checkoutStep !== 'details' || raffle.status !== 'ACTIVE') return undefined;
    const refreshAvailability = () => {
      if (document.visibilityState === 'visible') setNumberRetryKey((current) => current + 1);
    };
    const interval = window.setInterval(refreshAvailability, 10_000);
    document.addEventListener('visibilitychange', refreshAvailability);
    window.addEventListener('focus', refreshAvailability);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshAvailability);
      window.removeEventListener('focus', refreshAvailability);
    };
  }, [checkoutStep, raffle.id, raffle.status]);

  const toggleNumber = (number) => {
    if (selectedNumbers.includes(number)) {
      setSelectedNumbers((current) => current.filter((selected) => selected !== number));
      return;
    }
    if (selectedNumbers.length >= Math.min(97, maxNumbersPerUser)) {
      showNotice(`O limite desta rifa é de ${maxNumbersPerUser} números por telefone, incluindo reservas e compras anteriores.`);
      return;
    }
    setSelectedNumbers((current) => [...current, number].sort((a, b) => a - b));
  };

  const generatePix = async (event) => {
    event.preventDefault();
    setFormError('');

    if (customerName.trim().length < 3) {
      setFormError('Informe seu nome completo para continuar.');
      return;
    }
    const phoneDigits = whatsapp.replace(/\D/g, '');
    if (phoneDigits.length !== 10 && phoneDigits.length !== 11) {
      setFormError('Informe um WhatsApp com DDD e 10 ou 11 dígitos.');
      return;
    }

    setIsGeneratingPix(true);
    try {
      const order = await createPixOrder({
        raffleId: raffle.id,
        name: customerName.trim(),
        phone: phoneDigits,
        numbers: selectedNumbers,
      });
      setPixOrder(order);
      setNow(Date.now());
      setCopyMessage('');
      setCheckoutStep('pix');
    } catch (error) {
      if (error?.code === 'USER_LIMIT_REACHED') {
        setCheckoutStep('details');
        showNotice(error.message);
      } else if (error?.status === 409) {
        setCheckoutStep('details');
        setSelectedNumbers([]);
        setCurrentPage(0);
        setNumberRetryKey((current) => current + 1);
        showNotice('Um ou mais números foram reservados. Confira a disponibilidade e selecione novamente.');
      } else {
        setFormError(error instanceof Error ? error.message : 'Não foi possível gerar o Pix demonstrativo.');
      }
    } finally {
      setIsGeneratingPix(false);
    }
  };

  const copyPixCode = async () => {
    if (!pixOrder) return;
    try {
      await navigator.clipboard.writeText(pixOrder.copyPasteCode);
      setCopyMessage('Código demonstrativo copiado.');
    } catch {
      setCopyMessage('Não foi possível copiar automaticamente. Selecione o código acima e copie manualmente.');
    }
  };

  if (checkoutStep === 'identification') {
    return (
      <main className="checkout-page">
        <div className="container checkout-page__container">
          <div className="checkout-page__top">
            <button className="checkout-back" type="button" onClick={() => { setCheckoutStep('details'); setFormError(''); }}>
              <Icon name="arrow" size={16} className="checkout-back__icon" /> Voltar à escolha
            </button>
            <CheckoutProgress activeStep={2} />
          </div>
          <div className="checkout-layout">
            <section className="checkout-card checkout-form-card">
              <p className="section-kicker">Quase lá</p>
              <h1>Como podemos identificar você?</h1>
              <p className="checkout-form-card__intro">Sem cadastro ou senha. Informe seu nome e WhatsApp para vincular esta participação.</p>
              <form className="checkout-form" onSubmit={generatePix} noValidate>
                <div className="form-field">
                  <label htmlFor="customer-name">Nome completo</label>
                  <input
                    id="customer-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Seu nome completo"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="customer-whatsapp">WhatsApp com DDD</label>
                  <div className="phone-input">
                    <span>+55</span>
                    <input
                      id="customer-whatsapp"
                      name="telephone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="(11) 99999-9999"
                      value={whatsapp}
                      onChange={(event) => setWhatsapp(formatBrazilPhone(event.target.value))}
                      required
                    />
                  </div>
                </div>
                <div className="checkout-privacy-note">
                  <span><Icon name="shield" size={18} /></span>
                  <div><strong>Dados usados nesta reserva demonstrativa</strong><small>Nome e WhatsApp serão associados ao ID da transação para identificar os números reservados.</small></div>
                </div>
                {formError && <p className="checkout-error" role="alert">{formError}</p>}
                <button className="button button--full checkout-form__submit" type="submit" disabled={isGeneratingPix}>
                  {isGeneratingPix ? 'Gerando Pix demonstrativo…' : 'Gerar Pix'} <Icon name="arrow" size={18} />
                </button>
              </form>
            </section>
            <ParticipationSummary raffle={raffle} selectedNumbers={selectedNumbers} total={selectedNumbersValue} />
          </div>
        </div>
      </main>
    );
  }

  if (checkoutStep === 'pix' && pixOrder) {
    return (
      <main className="checkout-page">
        <div className="container checkout-page__container">
          <div className="checkout-page__top checkout-page__top--payment">
            <a className="checkout-back" href={`/rifas/${raffle.id}`}>
              <Icon name="arrow" size={16} className="checkout-back__icon" /> Voltar para a rifa
            </a>
            <CheckoutProgress activeStep={3} />
          </div>
          <div className="checkout-layout checkout-layout--pix">
            <section className="checkout-card pix-card">
              <span className="pix-card__status"><Icon name="check" size={14} /> Pix demonstrativo gerado</span>
              <h1>Seus números estão pré-reservados</h1>
              <p className="pix-card__intro">Esta reserva demonstrativa vale por 15 minutos. O QR code não aceita pagamento.</p>
              <p className="pix-card__intro">ID da transação: <strong>{pixOrder.id}</strong></p>
              <div className={`reservation-timer${remainingSeconds === 0 ? ' reservation-timer--expired' : ''}`}>
                <span>{remainingSeconds === 0 ? 'Prazo demonstrativo encerrado' : 'Tempo restante da reserva'}</span>
                <strong>{countdownLabel}</strong>
              </div>
              {remainingSeconds > 0 ? (
                <div className="pix-card__qr">
                  <QRCodeSVG
                    value={pixOrder.copyPasteCode}
                    size={230}
                    level="M"
                    marginSize={4}
                    bgColor="#ffffff"
                    fgColor="#10251c"
                    title="QR code Pix demonstrativo"
                  />
                </div>
              ) : (
                <div className="pix-expired-note">Esta pré-reserva de demonstração expirou. Volte para a rifa e selecione os números novamente.</div>
              )}
              <div className="pix-copy-field">
                <label htmlFor="pix-copy-code">Código Pix demonstrativo</label>
                <code id="pix-copy-code">{pixOrder.copyPasteCode}</code>
                <button className="button button--full" type="button" onClick={copyPixCode} disabled={remainingSeconds === 0}>
                  {copyMessage.startsWith('Código demonstrativo copiado') ? 'Código copiado' : 'Copiar código demonstrativo'}
                </button>
                {copyMessage && <p className="pix-copy-field__message" role="status">{copyMessage}</p>}
              </div>
              <div className="pix-demo-warning">
                <strong>Simulação — não é uma cobrança válida.</strong>
                <span>Este QR code e o código copia e cola são fictícios. Nenhum pagamento é enviado ou confirmado.</span>
              </div>
            </section>
            <ParticipationSummary raffle={raffle} selectedNumbers={selectedNumbers} total={pixOrder.amountInCents / 100} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="detail-page">
      <div className="container detail-page__container">
        <nav className="breadcrumbs" aria-label="Navegação estrutural">
          <a href="/">Início</a><Icon name="arrow" size={14} /><a href="/rifas">Rifas</a><Icon name="arrow" size={14} /><span>{raffle.title}</span>
        </nav>

        <div className="detail-top-grid">
          <section className="detail-overview">
            <div className="detail-overview__image-wrap">
              <img src={raffle.image} alt={raffle.imageAlt} className="detail-overview__image" />
            </div>
            <div className="detail-overview__content">
              <span className={`detail-status${raffle.status === 'DRAWN' ? ' detail-status--drawn' : ''}`}><span /> {raffle.status === 'DRAWN' ? 'Sorteio realizado' : 'Rifa ativa'}</span>
              <h1>{raffle.title}</h1>
              <p className="detail-overview__description">{raffle.description}</p>
              <div className="detail-organizer">
                <span className="detail-organizer__avatar">{organizerInitials}</span>
                <span><small>Organizado por</small><strong>{raffle.organizer}</strong></span>
                <Icon name="shield" size={17} />
              </div>
              <div className="detail-facts">
                <div><Icon name="ticket" size={20} /><span><small>Valor do prêmio</small><strong>{raffle.prizeValue === 'A confirmar' ? raffle.prizeValue : `R$ ${raffle.prizeValue}`}</strong></span></div>
                <div><Icon name="calendar" size={20} /><span><small>Data do sorteio</small><strong>{raffle.drawingDateLong}</strong></span></div>
              </div>
            </div>
          </section>

          <section className="detail-summary">
            <p className="section-kicker">Resumo da rifa</p>
            <div className="detail-summary__top">
              <div className="detail-summary__unit">
                <span>Cada número por</span>
                <strong>{formatCurrency(price)}</strong>
              </div>
              <div className="detail-summary__progress"><Progress value={raffle.sold} /></div>
            </div>
            <div className="detail-summary__metrics">
              <div><span>Valor total</span><strong>{formatCurrency(totalValue)}</strong></div>
              <div><span>Já arrecadado</span><strong>{formatCurrency(raisedValue)}</strong></div>
              <div><span>Falta arrecadar</span><strong>{formatCurrency(leftToRaise)}</strong></div>
              <div><span>Total de números</span><strong>{totalNumbers}</strong></div>
            </div>
            <div className="detail-safe">
              <span><Icon name="shield" size={20} /></span>
              <div><strong>Participação segura</strong><small>O checkout de pagamento será conectado em uma próxima etapa.</small></div>
            </div>
          </section>
        </div>

        {raffle.status === 'DRAWN' && raffle.drawResult && <section className="public-draw-result" aria-label="Resultado do sorteio">
          <div className="public-draw-result__heading"><span className="section-kicker">Sorteio realizado com sucesso</span><h2>Temos um ganhador!</h2><p>O resultado desta rifa foi registrado e pode ser conferido abaixo.</p></div>
          <div className="public-draw-result__details"><div><span>Número sorteado</span><strong>{String(raffle.drawResult.number).padStart(String(totalNumbers).length, '0')}</strong></div><div><span>Ganhador</span><strong>{raffle.drawResult.winnerName}</strong></div><div><span>Data e hora</span><strong>{formatDrawDateTime(raffle.drawResult.drawnAt)}</strong></div></div>
        </section>}

        {raffle.status === 'ACTIVE' ? <section className="number-section" id="selecionar-numeros">
          <div className="number-section__heading">
            <div>
              <p className="section-kicker">Situação dos números</p>
              <h2>Escolha seus números da sorte</h2>
              <p>Limite de {maxNumbersPerUser} números por telefone nesta rifa, incluindo reservas e compras anteriores.</p>
            </div>
            <div className="number-legend" aria-label="Legenda dos números">
              <div><span className="number-legend__dot number-legend__dot--available" /><span>Disponíveis<strong>{availableNumbers}</strong></span></div>
              <div><span className="number-legend__dot number-legend__dot--reserved" /><span>Reservados<strong>{numberStatusCounts.reserved}</strong></span></div>
              <div><span className="number-legend__dot number-legend__dot--confirmed" /><span>Confirmados<strong>{numberStatusCounts.confirmed}</strong></span></div>
            </div>
          </div>

          <div className="number-pagination" aria-label="Páginas de números">
            {Array.from({ length: pageCount }, (_, pageIndex) => {
              const start = pageIndex * pageSize + 1;
              const end = Math.min(start + pageSize - 1, totalNumbers);
              return (
                <button
                  key={pageIndex}
                  type="button"
                  className={currentPage === pageIndex ? 'number-pagination__button number-pagination__button--active' : 'number-pagination__button'}
                  aria-current={currentPage === pageIndex ? 'page' : undefined}
                  onClick={() => setCurrentPage(pageIndex)}
                >
                  {String(start).padStart(2, '0')}–{String(end).padStart(2, '0')}
                </button>
              );
            })}
          </div>

          {numberRequest.status === 'loading' ? (
            <p className="raffles-empty" role="status">Carregando disponibilidade dos números...</p>
          ) : numberRequest.status === 'error' ? (
            <div className="raffles-empty" role="alert">
              <p>Não foi possível carregar a disponibilidade desta página.</p>
              <button className="button" type="button" onClick={() => setNumberRetryKey((current) => current + 1)}>Tentar novamente</button>
            </div>
          ) : (
          <div className="number-grid">
            {visibleNumbers.map((number) => {
              const status = numberStatuses[number];
              const isSelected = selectedNumbers.includes(number);
              const numberClass = isSelected ? 'number-button number-button--selected' : `number-button number-button--${status}`;
              const statusText = status === 'available' ? 'disponível' : status === 'reserved' ? 'reservado' : 'confirmado';
              return (
                <button
                  key={number}
                  className={numberClass}
                  type="button"
                  disabled={status !== 'available'}
                  aria-pressed={isSelected}
                  aria-label={`Número ${String(number).padStart(2, '0')}, ${isSelected ? 'selecionado' : statusText}`}
                  onClick={() => toggleNumber(number)}
                >
                  {String(number).padStart(2, '0')}
                </button>
              );
            })}
          </div>
          )}
          {numberRequest.refreshError && <p className="raffles-empty" role="alert">A disponibilidade não pôde ser atualizada. Os números são confirmados novamente antes da reserva.</p>}

          <div className="number-picker-footer">
            <div className="number-picker-footer__available">
              <span className="number-picker-footer__icon"><Icon name="ticket" size={20} /></span>
              <span><strong>{availableNumbers} números ainda disponíveis</strong><small>A partir de {formatCurrency(price)}</small></span>
            </div>
            <div className="number-picker-footer__selection">
              <span>{selectedNumbers.length ? `${selectedNumbers.length} ${selectedNumbers.length === 1 ? 'número selecionado' : 'números selecionados'}` : 'Selecione números disponíveis'}</span>
              <strong>{formatCurrency(selectedNumbersValue)}</strong>
            </div>
            <button
              className="button number-picker-footer__button"
              type="button"
              disabled={!selectedNumbers.length || numberRequest.status !== 'ready'}
              onClick={() => { setFormError(''); setCheckoutStep('identification'); }}
            >
              Continuar <Icon name="arrow" size={18} />
            </button>
          </div>
          <p className="detail-demo-note">Disponibilidade demonstrativa. Os números ficam pré-reservados por 15 minutos após gerar o código Pix.</p>
        </section> : <section className="raffle-completed-note"><strong>Esta rifa já foi sorteada.</strong><p>As participações foram encerradas. Confira o resultado oficial acima.</p><a className="button" href="/rifas">Ver outras rifas <Icon name="arrow" size={18} /></a></section>}
      </div>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="not-found-page">
      <div className="container">
        <p className="section-kicker">Página não encontrada</p>
        <h1>Essa rifa não está disponível.</h1>
        <p>Confira as rifas ativas para encontrar outro prêmio.</p>
        <a className="button" href="/rifas">Ver rifas <Icon name="arrow" size={18} /></a>
      </div>
    </main>
  );
}

function RafflesLoadState({ error, onRetry }) {
  return (
    <main className="raffles-state">
      <div className="raffles-state__content" role={error ? 'alert' : 'status'}>
        {error ? (
          <>
            <p className="section-kicker">Não foi possível carregar</p>
            <h1>As rifas não estão disponíveis agora.</h1>
            <p>Confira sua conexão e tente novamente.</p>
            <button className="button" type="button" onClick={onRetry}>Tentar novamente</button>
          </>
        ) : (
          <>
            <span className="raffles-state__spinner" aria-hidden="true" />
            <p>Carregando rifas...</p>
          </>
        )}
      </div>
    </main>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [raffles, setRaffles] = useState([]);
  const [drawnRaffles, setDrawnRaffles] = useState([]);
  const [rafflesRequest, setRafflesRequest] = useState({ status: 'loading' });
  const [raffleDetail, setRaffleDetail] = useState(null);
  const [raffleDetailRequest, setRaffleDetailRequest] = useState({ status: 'loading' });
  const [rafflesRetryKey, setRafflesRetryKey] = useState(0);
  const noticeTimeout = useRef(null);
  const pathname = usePathname() || '/';
  const currentPath = pathname.replace(/\/+$/, '') || '/';
  const isOrganizerRoute = currentPath.startsWith('/organizador');
  const detailMatch = currentPath.match(/^\/rifas\/([^/]+)$/);
  const raffleIdFromPath = detailMatch?.[1] || '';
  const isCatalogRoute = currentPath === '/' || currentPath === '/rifas';
  const selectedRaffle = detailMatch ? raffleDetail : null;
  const featuredRaffle = raffles.find((raffle) => raffle.featured);
  const otherHomeRaffles = raffles.filter((raffle) => raffle.id !== featuredRaffle?.id);
  const pageTitle = selectedRaffle
    ? `${selectedRaffle.title} | RIFOU`
    : currentPath === '/rifas' ? 'Rifas ativas | RIFOU'
      : isOrganizerRoute ? `${currentPath === '/organizador/dashboard' ? 'Painel do organizador' : 'Acesso do organizador'} | RIFOU`
        : 'RIFOU — App de Rifas';

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  useEffect(() => {
    if (isOrganizerRoute || raffleIdFromPath || !isCatalogRoute) return undefined;

    const controller = new AbortController();
    const loadRaffles = async () => {
      setRafflesRequest({ status: 'loading' });
      try {
        const [response, featuredResponse, drawnResponse] = await Promise.all([
          fetch('/api/raffles?status=ACTIVE', {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch('/api/raffles?status=ACTIVE&featured=true&limit=1', {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          }).catch((error) => {
            if (!controller.signal.aborted) console.warn('Não foi possível consultar a rifa em destaque.', error);
            return null;
          }),
          fetch(`/api/raffles?status=DRAWN&limit=${currentPath === '/' ? 6 : 50}`, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          }).catch((error) => {
            if (!controller.signal.aborted) console.warn('Não foi possível consultar o histórico de rifas sorteadas.', error);
            return null;
          }),
        ]);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.message || 'Falha ao buscar rifas.');
        }
        if (!Array.isArray(payload.items)) {
          throw new Error('A resposta da API de rifas é inválida.');
        }
        let featuredItem = null;
        if (featuredResponse) {
          try {
            const featuredPayload = await featuredResponse.json();
            if (featuredResponse.ok && Array.isArray(featuredPayload.items)) {
              featuredItem = featuredPayload.items.find((item) => item.featured) || null;
            } else {
              console.warn('Não foi possível consultar a rifa em destaque.', featuredPayload.message || featuredResponse.status);
            }
          } catch (error) {
            if (!controller.signal.aborted) console.warn('Resposta inválida ao consultar a rifa em destaque.', error);
          }
        }
        const otherRaffles = payload.items.filter((item) => item.id !== featuredItem?.id);
        setRaffles(featuredItem ? [featuredItem, ...otherRaffles] : otherRaffles);
        if (drawnResponse?.ok) {
          const drawnPayload = await drawnResponse.json().catch(() => ({}));
          setDrawnRaffles(Array.isArray(drawnPayload.items) ? drawnPayload.items : []);
        } else {
          setDrawnRaffles([]);
          if (drawnResponse && !controller.signal.aborted) console.warn('A API de histórico de rifas sorteadas respondeu com erro.', drawnResponse.status);
        }
        setRafflesRequest({ status: 'ready' });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Não foi possível carregar as rifas.', error);
        setRafflesRequest({ status: 'error' });
      }
    };

    loadRaffles();
    return () => controller.abort();
  }, [isOrganizerRoute, raffleIdFromPath, isCatalogRoute, currentPath, rafflesRetryKey]);

  useEffect(() => {
    if (!raffleIdFromPath) return undefined;

    const controller = new AbortController();
    const raffleId = raffleIdFromPath;
    const loadRaffle = async () => {
      setRaffleDetailRequest({ status: 'loading' });
      try {
        const response = await fetch(`/api/raffles/${encodeURIComponent(raffleId)}`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || 'Falha ao buscar a rifa.');
        if (!payload?.item || payload.item.id !== raffleId) {
          throw new Error('A resposta da API da rifa é inválida.');
        }
        setRaffleDetail(payload.item);
        setRaffleDetailRequest({ status: 'ready' });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Não foi possível carregar a rifa.', error);
        setRaffleDetailRequest({ status: 'error' });
      }
    };

    loadRaffle();
    return () => controller.abort();
  }, [raffleIdFromPath, rafflesRetryKey]);

  const showNotice = (message) => {
    setNotice(message);
    window.clearTimeout(noticeTimeout.current);
    noticeTimeout.current = window.setTimeout(() => setNotice(''), 3200);
  };

  const publicRequest = detailMatch ? raffleDetailRequest : rafflesRequest;
  if (!isOrganizerRoute && (isCatalogRoute || detailMatch) && publicRequest.status !== 'ready') {
    return (
      <>
        <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
        <RafflesLoadState
          error={publicRequest.status === 'error'}
          onRetry={() => setRafflesRetryKey((current) => current + 1)}
        />
        <SiteFooter showNotice={showNotice} />
      </>
    );
  }

  return (
    <>
      {!isOrganizerRoute && <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} />}

      {isOrganizerRoute ? (
        <OrganizerRoutes currentPath={currentPath} />
      ) : currentPath === '/' ? (
      <main>
        <section className="hero" id="inicio">
          <div className="hero__orb hero__orb--one" aria-hidden="true" />
          <div className="hero__orb hero__orb--two" aria-hidden="true" />
          <div className="container hero__layout">
            <div className="hero__copy">
              <div className="eyebrow-pill"><Icon name="shield" size={15} /> Simples, seguro e transparente</div>
              <h1>Sua próxima conquista pode estar a <span>um número</span> de distância.</h1>
              <p className="hero__description">
                Participe das melhores rifas ou crie a sua com total controle, transparência e segurança do início ao fim.
              </p>
              <div className="hero__actions">
                <a className="button" href="#rifas">Explorar rifas <Icon name="arrow" size={18} /></a>
                <a className="text-link" href="#como-funciona"><span className="text-link__icon"><Icon name="eye" size={19} /></span> Ver como funciona</a>
              </div>
              <div className="social-proof">
                <div className="social-proof__avatars" aria-hidden="true">
                  <span>CM</span><span>MA</span><span>AR</span>
                </div>
                <div><strong>+12 mil participantes</strong><span>Confiam no RIFOU todos os meses</span></div>
              </div>
            </div>

            <div className="hero__visual">
              {featuredRaffle && <article className="featured-card" id="rifa-destaque">
                <div className="featured-card__image-wrap">
                  <img src={featuredRaffle.image} alt={featuredRaffle.imageAlt || featuredRaffle.title} className="featured-card__image" />
                  <div className="protected-badge"><span><Icon name="shield" size={18} /></span><div><strong>Compra protegida</strong><small>Pagamento seguro via Pix</small></div></div>
                </div>
                <div className="featured-card__body">
                  <div className="featured-card__topline">
                    <div><p className="featured-card__label">Rifa em destaque</p><h2>{featuredRaffle.title}</h2><p className="featured-card__organizer">por {featuredRaffle.organizer}</p></div>
                    <div className="featured-card__price"><span>Por apenas</span><strong>R$ {featuredRaffle.price}</strong></div>
                  </div>
                  <Progress value={featuredRaffle.cardSold ?? featuredRaffle.sold} />
                  <a className="button button--full" href={`/rifas/${featuredRaffle.id}`}>
                    Quero participar <Icon name="arrow" size={19} />
                  </a>
                </div>
              </article>}
            </div>
          </div>
        </section>

        <section className="raffles-section section" id="rifas">
          <div className="container">
            <div className="section-heading section-heading--row">
              <div>
                <p className="section-kicker">Oportunidades em destaque</p>
                <h2>Outras rifas para você</h2>
              </div>
              <a className="section-heading__link" href="/rifas">Ver todas as rifas <Icon name="arrow" size={17} /></a>
            </div>
            {otherHomeRaffles.length ? (
              <div className="raffle-grid">
                {otherHomeRaffles.map((raffle) => <RaffleCard key={raffle.id} raffle={raffle} />)}
              </div>
            ) : (
              <p className="raffles-empty">A rifa em destaque está disponível acima. Novas rifas aparecerão aqui.</p>
            )}
          </div>
        </section>

        <DrawnRafflesSection raffles={drawnRaffles} compact />

        <section className="how-section section" id="como-funciona">
          <div className="container">
            <div className="how-section__heading">
              <p className="section-kicker">É fácil participar</p>
              <h2>Três passos. Uma grande chance.</h2>
              <p>Sem cadastro, sem burocracia. Escolha, pague e acompanhe.</p>
            </div>
            <div className="steps-grid">
              {steps.map((step) => (
                <article className="step-card" key={step.number}>
                  <span className="step-card__icon"><Icon name={step.icon} size={20} /></span>
                  <span className="step-card__number">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      ) : currentPath === '/rifas' ? (
        <RafflesPage raffles={raffles} drawnRaffles={drawnRaffles} />
      ) : selectedRaffle ? (
        <RaffleDetailsPage key={selectedRaffle.id} raffle={selectedRaffle} showNotice={showNotice} />
      ) : (
        <NotFoundPage />
      )}

      {!isOrganizerRoute && <SiteFooter showNotice={showNotice} />}

      <div className={`toast${notice ? ' toast--visible' : ''}`} role="status" aria-live="polite">{notice}</div>
    </>
  );
}

export default App;
