// Interface strings in English and Spanish. Catalog data (scope, notes, domain names) stays in
// English, as the issuers publish it. Values are strings with {placeholders} or functions.

const KEY = 'pathfinder:lang';

const en = {
  skip: 'Skip to content',
  'nav.aria': 'Sections',
  'nav.certs': 'Certifications',
  'nav.certsShort': 'Catalog',
  'nav.plan': 'Plan',
  'nav.compare': 'Compare',
  'nav.progress': 'Progress',
  'nav.about': 'About',
  'lang.switch': 'ES',
  'lang.aria': 'Ver en español',
  'theme.toLight': 'Switch to light theme',
  'theme.toDark': 'Switch to dark theme',
  loading: 'Loading…',
  'load.error': 'Could not load the catalog ({e}). Reload to try again.',

  'hero.title': 'Pick a certification.<br>Plan the climb.',
  'hero.lede': 'Compare prices, exam formats and domains, then turn any certification into a dated study plan.',
  'hero.certs': 'certifications',
  'hero.providers': 'providers',
  'hero.prep': 'with prep guides',
  'hero.free': 'free',
  'hero.pause': 'Pause the moving badges',
  'hero.matches': ({ n }) => (n === 1 ? '1 match below' : n ? `${n} matches below` : 'No matches below'),
  'aria.category': 'Category',
  'aria.provider': 'Provider',
  'cat.all': 'Everything',
  'cat.word': ' certifications',
  'cat.AI engineering': 'AI engineering',
  'cat.ML foundations': 'ML foundations',
  'cat.AI security': 'AI security',
  'cat.Cloud & platform': 'Cloud & platform',

  'search.placeholder': 'Search name, code or topic',
  'search.aria': 'Search certifications',
  'filter.level': 'Level',
  'filter.allLevels': 'All levels',
  'filter.price': 'Price',
  'price.any': 'Any price',
  'price.free': 'Free',
  'price.upto': 'Up to US${n}',
  forMe: 'For me',
  'profile.want': 'What do you want to learn?',
  'profile.exp': 'Experience',
  'exp.new': 'New',
  'exp.some': '1–3 years',
  'exp.experienced': '3+ years',
  'profile.more': 'Role and tools you already use',
  'profile.role': 'Your role',
  'profile.known': 'What do you already use?',
  'profile.clear': 'Clear all',
  'list.head': ({ shown, total, scored }) => `${shown === total ? `All ${total}` : `${shown} of ${total}`} certifications${scored ? ', best match first' : ''}`,
  'list.empty': 'Nothing matches. Try fewer filters.',
  'match.aria': 'Match {n} of 100',

  'compare.add': 'Add to compare',
  'compare.remove': 'Remove from compare',
  'compare.in': 'In compare',
  'compare.full': 'Compare holds four',
  'compare.btn': 'Compare',
  'compare.title': 'Compare',
  'compare.empty': 'Nothing here yet. Use the + on any certification to add it.',
  'compare.removeOne': 'Remove',
  copyLink: 'Copy link',
  clear: 'Clear',
  copied: 'Copied',
  copyFailed: 'Copy failed',

  'fee.varies': 'Varies',
  'fee.free': 'Free',
  'dur.practical': 'Practical',
  'flag.restricted': 'Restricted',
  'flag.upcoming': 'Not open yet',
  'prep.official-guide': 'Official guide',
  'prep.course': 'Course',
  'prep.docs': 'Docs',
  'prep.practice': 'Practice',
  paid: 'Paid',
  free: 'Free',

  'cert.back': 'All certifications',
  'cert.plan': 'Plan your study',
  'cert.issuer': 'Issuer page',
  'cert.share': 'Share',
  'cert.ai': 'AI during the exam: {x}',
  'cert.domains': 'Exam domains',
  'cert.why': 'Why it fits you',
  'cert.good': 'Good to know',
  'cert.prep': 'Prepare with',
  'cert.sources': 'Sources',
  'cert.checked': 'Checked {d} against the issuer.',
  'cert.nSources': ({ n }) => `${n} source${n === 1 ? '' : 's'}`,
  'cert.morePrep': ({ n }) => `${n} more resource${n === 1 ? '' : 's'}`,
  'cert.nReports': ({ n }) => `${n} candidate report${n === 1 ? '' : 's'}`,
  'cert.reportsHint': 'Self-reported. Useful for how people prepared, not for pass rates.',
  'stat.price': 'Price',
  'stat.length': 'Exam length',
  'stat.questions': 'Questions',
  'stat.passing': 'Passing score',
  'stat.valid': 'Valid for',
  'stat.format': 'Format',
  'stat.registration': 'Registration',
  'stat.level': 'Level',
  'stat.domains': 'Domains',
  'stat.ai': 'AI in the exam',
  'donut.label': 'domains',
  'donut.aria': 'Exam domain weights',

  'plan.title': 'Study plan',
  'plan.cert': 'Certification',
  'plan.start': 'Start',
  'plan.exam': 'Exam date',
  'plan.hours': 'Hours',
  'plan.session': 'Session',
  'plan.time': 'Time',
  'plan.days': 'Study days',
  'plan.rate': 'Rate your topics',
  'plan.rated': 'Rate your topics · {n} rated',
  'plan.rateHint': '1 = new to me, 5 = I could teach it. Weaker topics get more sessions.',
  'plan.confAria': 'Confidence in {x}',
  'plan.suggested': 'Suggested: {h} h for {level} level',
  'plan.useIt': 'use it',
  'plan.statusInfo': 'Keep this pace and you can sit the exam from {d}.',
  'plan.fits': ({ d, spare }) => `Fits before your exam on ${d}${spare ? `, with ${spare} spare day${spare === 1 ? '' : 's'}` : ''}.`,
  'plan.fixLen': '{x} sessions',
  'plan.fixDays': 'more study days',
  'plan.fixExam': 'an exam on {d} or later',
  'plan.noFit': ({ d, needed, available, fixes }) => `Does not fit before ${d}: ${needed} sessions, ${available} study days. Try ${fixes.slice(0, -1).join(', ')} or ${fixes.at(-1)}.`,
  'plan.sessions': 'Sessions',
  'plan.studyTime': 'Study time',
  'plan.fromTo': 'From – to',
  'plan.examDay': 'Exam',
  'plan.earliest': 'Earliest exam',
  'plan.of': '{a} of {b}',
  'plan.done': 'sessions done',
  'plan.pctDone': '{p}% done',
  'plan.calendar': 'Add to calendar',
  'plan.print': 'Print',
  'plan.track': 'Track progress',
  'plan.tracking': 'Tracking',
  'plan.inferred': "No official domains in the catalog for this one, so topics come from its summary. Swap in the issuer's objectives.",
  'plan.byTopic': 'Time by topic',
  'plan.perWeek': 'Hours per week',
  'plan.perWeekAria': 'Study hours per week',
  'plan.mockWeeks': 'Highlighted weeks include a timed mock.',
  'plan.wk': 'W{n}',
  'plan.weekTitle': 'Week {n} ({r}): {h} h',
  'plan.week': 'Week {n}',
  'plan.what': 'What each session is',
  'plan.resources': 'Resources',
  'plan.sessionDone': 'Session {n} done',

  'kind.baseline': 'Start',
  'kind.learn': 'Learn',
  'kind.practice': 'Practice',
  'kind.mock': 'Mock',
  'kind.review': 'Review',
  'kind.remediate': 'Fix',
  'kind.final': 'Final',

  'progress.title': 'Progress',
  'progress.empty': 'No plans tracked yet. Open a plan and press Track progress, or tick off a session.',
  'progress.start': 'Make a plan',
  'progress.streak': 'Streak',
  'progress.streakUnit': ({ n }) => `${n} session${n === 1 ? '' : 's'} on schedule`,
  'progress.hours': 'Hours done',
  'progress.sessions': 'Sessions done',
  'progress.plans': 'Plans',
  'progress.next': 'Up next',
  'progress.nothingNext': 'No sessions left. Book the exam.',
  'progress.behind': ({ n }) => `${n} past session${n === 1 ? '' : 's'} not ticked off yet.`,
  'progress.weeks': 'Last weeks and next ones',
  'progress.legendDone': 'Done',
  'progress.legendMissed': 'Not ticked',
  'progress.legendPlanned': 'Planned',
  'progress.today': 'Today',
  'progress.open': 'Open plan',
  'progress.stop': 'Stop tracking',
  'progress.nextOne': 'Next: {x}',
  'progress.examOn': 'Exam {d}',

  'about.title': 'About',
  'about.what': 'What it is',
  'about.whatP': 'pathfinder helps you pick an IT certification and plan the study. It is open source and runs entirely in your browser: your choices and progress stay on this device.',
  'about.data': 'Where the data comes from',
  'about.dataNote': ({ n, p, s, r, checked }) => `${n} certifications from ${p} providers, ${s} sources and ${r} candidate reports, checked ${checked}. Every fact links to the issuer's own page.`,
  'about.checkedOn': 'on {d}',
  'about.checkedBetween': 'between {a} and {b}',
  'about.price': 'Prices change and vary by country. Confirm with the issuer before you pay.',
  'about.langNote': 'Catalog details (scope, notes, domain names) are in English, as the issuers publish them.',
  'about.levels': 'Levels',
  'about.levelsP': 'Levels use trail difficulty signs:',
  'about.score': '“For me” score',
  'about.scoreP': 'Up to 100 points: 45 for the skills you want to learn, 20 for your role, 20 for the skills you already use and 15 for how the level fits your experience. It sorts the list. It does not predict a pass.',
  'about.hours': 'Study hours',
  'about.ranges': 'Ranges: {x}.',
  'about.contrib': 'Contribute',
  'about.contribP': 'Each certification is one JSON file. Corrections are welcome on <a href="https://github.com/legiosai/pathfinder">GitHub</a>. Names belong to their issuers; pathfinder is not affiliated with any of them.',
  'about.install': 'Install it',
  'about.installP': 'pathfinder works offline once loaded. Use your browser’s “Install” or “Add to Home Screen” to keep it as an app.',
  foot: 'pathfinder · MIT · <a href="https://github.com/legiosai/pathfinder">GitHub</a> · icons by <a href="https://lucide.dev">Lucide</a> and <a href="https://simpleicons.org">Simple Icons</a> · logos are trademarks of their owners',
  'foot.catalog': 'Catalog {d}',
  offline: 'Offline: showing the saved copy.',
};

const es = {
  skip: 'Saltar al contenido',
  'nav.aria': 'Secciones',
  'nav.certs': 'Certificaciones',
  'nav.certsShort': 'Catálogo',
  'nav.plan': 'Plan',
  'nav.compare': 'Comparar',
  'nav.progress': 'Progreso',
  'nav.about': 'Acerca de',
  'lang.switch': 'EN',
  'lang.aria': 'View in English',
  'theme.toLight': 'Cambiar a tema claro',
  'theme.toDark': 'Cambiar a tema oscuro',
  loading: 'Cargando…',
  'load.error': 'No se pudo cargar el catálogo ({e}). Recargá para reintentar.',

  'hero.title': 'Elegí una certificación.<br>Planificá la subida.',
  'hero.lede': 'Compará precios, formatos de examen y dominios, y convertí cualquier certificación en un plan de estudio con fechas.',
  'hero.certs': 'certificaciones',
  'hero.providers': 'proveedores',
  'hero.prep': 'con guías de estudio',
  'hero.free': 'gratis',
  'hero.pause': 'Pausar los badges en movimiento',
  'hero.matches': ({ n }) => (n === 1 ? '1 resultado abajo' : n ? `${n} resultados abajo` : 'Sin resultados abajo'),
  'aria.category': 'Categoría',
  'aria.provider': 'Proveedor',
  'cat.all': 'Todo',
  'cat.word': ' certificaciones',
  'cat.AI engineering': 'Ingeniería de IA',
  'cat.ML foundations': 'Fundamentos de ML',
  'cat.AI security': 'Seguridad de IA',
  'cat.Cloud & platform': 'Cloud y plataforma',

  'search.placeholder': 'Buscá por nombre, código o tema',
  'search.aria': 'Buscar certificaciones',
  'filter.level': 'Nivel',
  'filter.allLevels': 'Todos los niveles',
  'filter.price': 'Precio',
  'price.any': 'Cualquier precio',
  'price.free': 'Gratis',
  'price.upto': 'Hasta US${n}',
  forMe: 'Para mí',
  'profile.want': '¿Qué querés aprender?',
  'profile.exp': 'Experiencia',
  'exp.new': 'Empiezo',
  'exp.some': '1–3 años',
  'exp.experienced': '3+ años',
  'profile.more': 'Rol y herramientas que ya usás',
  'profile.role': 'Tu rol',
  'profile.known': '¿Qué ya usás?',
  'profile.clear': 'Borrar todo',
  'list.head': ({ shown, total, scored }) => `${shown === total ? `Las ${total}` : `${shown} de ${total}`} certificaciones${scored ? ', las que más te sirven primero' : ''}`,
  'list.empty': 'No hay coincidencias. Probá con menos filtros.',
  'match.aria': 'Coincidencia {n} de 100',

  'compare.add': 'Agregar a comparar',
  'compare.remove': 'Quitar de comparar',
  'compare.in': 'Comparando',
  'compare.full': 'Se comparan hasta cuatro',
  'compare.btn': 'Comparar',
  'compare.title': 'Comparar',
  'compare.empty': 'Todavía no hay nada. Usá el + de cualquier certificación para sumarla.',
  'compare.removeOne': 'Quitar',
  copyLink: 'Copiar link',
  clear: 'Limpiar',
  copied: 'Copiado',
  copyFailed: 'No se pudo copiar',

  'fee.varies': 'Varía',
  'fee.free': 'Gratis',
  'dur.practical': 'Práctico',
  'flag.restricted': 'Restringida',
  'flag.upcoming': 'Todavía no abre',
  'prep.official-guide': 'Guía oficial',
  'prep.course': 'Curso',
  'prep.docs': 'Documentación',
  'prep.practice': 'Práctica',
  paid: 'Pago',
  free: 'Gratis',

  'cert.back': 'Todas las certificaciones',
  'cert.plan': 'Planificá tu estudio',
  'cert.issuer': 'Página del emisor',
  'cert.share': 'Compartir',
  'cert.ai': 'IA durante el examen: {x}',
  'cert.domains': 'Dominios del examen',
  'cert.why': 'Por qué te sirve',
  'cert.good': 'Para tener en cuenta',
  'cert.prep': 'Prepará con',
  'cert.sources': 'Fuentes',
  'cert.checked': 'Verificado el {d} contra el emisor.',
  'cert.nSources': ({ n }) => `${n} fuente${n === 1 ? '' : 's'}`,
  'cert.morePrep': ({ n }) => `${n} recurso${n === 1 ? '' : 's'} más`,
  'cert.nReports': ({ n }) => `${n} reporte${n === 1 ? '' : 's'} de candidatos`,
  'cert.reportsHint': 'Autorreportados. Sirven para ver cómo se prepararon, no para tasas de aprobación.',
  'stat.price': 'Precio',
  'stat.length': 'Duración',
  'stat.questions': 'Preguntas',
  'stat.passing': 'Para aprobar',
  'stat.valid': 'Vigencia',
  'stat.format': 'Formato',
  'stat.registration': 'Inscripción',
  'stat.level': 'Nivel',
  'stat.domains': 'Dominios',
  'stat.ai': 'IA en el examen',
  'donut.label': 'dominios',
  'donut.aria': 'Pesos de los dominios del examen',

  'plan.title': 'Plan de estudio',
  'plan.cert': 'Certificación',
  'plan.start': 'Inicio',
  'plan.exam': 'Fecha del examen',
  'plan.hours': 'Horas',
  'plan.session': 'Sesión',
  'plan.time': 'Hora',
  'plan.days': 'Días de estudio',
  'plan.rate': 'Calificá tus temas',
  'plan.rated': 'Calificá tus temas · {n} calificados',
  'plan.rateHint': '1 = nuevo para mí, 5 = podría enseñarlo. Los temas más flojos reciben más sesiones.',
  'plan.confAria': 'Confianza en {x}',
  'plan.suggested': 'Sugerido: {h} h para nivel {level}',
  'plan.useIt': 'usarlo',
  'plan.statusInfo': 'Con este ritmo podés rendir desde el {d}.',
  'plan.fits': ({ d, spare }) => `Entra antes de tu examen del ${d}${spare ? `, con ${spare} día${spare === 1 ? '' : 's'} de margen` : ''}.`,
  'plan.fixLen': 'sesiones de {x}',
  'plan.fixDays': 'más días de estudio',
  'plan.fixExam': 'un examen el {d} o después',
  'plan.noFit': ({ d, needed, available, fixes }) => `No entra antes del ${d}: ${needed} sesiones, ${available} días de estudio. Probá con ${fixes.slice(0, -1).join(', ')} o ${fixes.at(-1)}.`,
  'plan.sessions': 'Sesiones',
  'plan.studyTime': 'Tiempo de estudio',
  'plan.fromTo': 'Desde – hasta',
  'plan.examDay': 'Examen',
  'plan.earliest': 'Examen desde',
  'plan.of': '{a} de {b}',
  'plan.done': 'sesiones hechas',
  'plan.pctDone': '{p}% hecho',
  'plan.calendar': 'Agregar al calendario',
  'plan.print': 'Imprimir',
  'plan.track': 'Seguir progreso',
  'plan.tracking': 'Siguiendo',
  'plan.inferred': 'El catálogo no tiene dominios oficiales para esta, así que los temas salen de su resumen. Reemplazalos por los objetivos del emisor.',
  'plan.byTopic': 'Tiempo por tema',
  'plan.perWeek': 'Horas por semana',
  'plan.perWeekAria': 'Horas de estudio por semana',
  'plan.mockWeeks': 'Las semanas resaltadas incluyen un simulacro cronometrado.',
  'plan.wk': 'S{n}',
  'plan.weekTitle': 'Semana {n} ({r}): {h} h',
  'plan.week': 'Semana {n}',
  'plan.what': 'Qué es cada sesión',
  'plan.resources': 'Recursos',
  'plan.sessionDone': 'Sesión {n} hecha',

  'kind.baseline': 'Inicio',
  'kind.learn': 'Aprender',
  'kind.practice': 'Práctica',
  'kind.mock': 'Simulacro',
  'kind.review': 'Repaso',
  'kind.remediate': 'Corregir',
  'kind.final': 'Final',

  'progress.title': 'Progreso',
  'progress.empty': 'Todavía no seguís ningún plan. Abrí un plan y tocá Seguir progreso, o marcá una sesión.',
  'progress.start': 'Armar un plan',
  'progress.streak': 'Racha',
  'progress.streakUnit': ({ n }) => `${n} sesi${n === 1 ? 'ón' : 'ones'} al día`,
  'progress.hours': 'Horas hechas',
  'progress.sessions': 'Sesiones hechas',
  'progress.plans': 'Planes',
  'progress.next': 'Lo que sigue',
  'progress.nothingNext': 'No quedan sesiones. Reservá el examen.',
  'progress.behind': ({ n }) => `${n} sesi${n === 1 ? 'ón pasada' : 'ones pasadas'} sin marcar.`,
  'progress.weeks': 'Semanas pasadas y próximas',
  'progress.legendDone': 'Hecha',
  'progress.legendMissed': 'Sin marcar',
  'progress.legendPlanned': 'Planificada',
  'progress.today': 'Hoy',
  'progress.open': 'Abrir plan',
  'progress.stop': 'Dejar de seguir',
  'progress.nextOne': 'Sigue: {x}',
  'progress.examOn': 'Examen {d}',

  'about.title': 'Acerca de',
  'about.what': 'Qué es',
  'about.whatP': 'pathfinder te ayuda a elegir una certificación de IT y planificar el estudio. Es open source y corre entero en tu navegador: tus elecciones y tu progreso quedan en este dispositivo.',
  'about.data': 'De dónde salen los datos',
  'about.dataNote': ({ n, p, s, r, checked }) => `${n} certificaciones de ${p} proveedores, ${s} fuentes y ${r} reportes de candidatos, verificados ${checked}. Cada dato enlaza a la página del emisor.`,
  'about.checkedOn': 'el {d}',
  'about.checkedBetween': 'entre el {a} y el {b}',
  'about.price': 'Los precios cambian y varían según el país. Confirmalos con el emisor antes de pagar.',
  'about.langNote': 'Los detalles del catálogo (alcance, notas, nombres de dominios) están en inglés, como los publican los emisores.',
  'about.levels': 'Niveles',
  'about.levelsP': 'Los niveles usan las señales de dificultad de los senderos:',
  'about.score': 'Puntaje “Para mí”',
  'about.scoreP': 'Hasta 100 puntos: 45 por lo que querés aprender, 20 por tu rol, 20 por lo que ya usás y 15 por cómo el nivel encaja con tu experiencia. Ordena la lista. No predice si vas a aprobar.',
  'about.hours': 'Horas de estudio',
  'about.ranges': 'Rangos: {x}.',
  'about.contrib': 'Contribuir',
  'about.contribP': 'Cada certificación es un archivo JSON. Las correcciones son bienvenidas en <a href="https://github.com/legiosai/pathfinder">GitHub</a>. Los nombres pertenecen a sus emisores; pathfinder no está afiliado a ninguno.',
  'about.install': 'Instalala',
  'about.installP': 'pathfinder funciona sin conexión una vez cargada. Usá “Instalar” o “Agregar a pantalla de inicio” en tu navegador para tenerla como app.',
  foot: 'pathfinder · MIT · <a href="https://github.com/legiosai/pathfinder">GitHub</a> · íconos de <a href="https://lucide.dev">Lucide</a> y <a href="https://simpleicons.org">Simple Icons</a> · los logos son marcas de sus dueños',
  'foot.catalog': 'Catálogo {d}',
  offline: 'Sin conexión: mostrando la copia guardada.',
};

// Taxonomy labels. Roles and skills share some ids, so they are keyed by group.
const ES_LABELS = {
  'levels.entry': 'Inicial',
  'levels.associate': 'Asociado',
  'levels.professional': 'Profesional',
  'levels.expert': 'Experto',
  'statuses.available': 'Inscripción abierta',
  'statuses.restricted': 'Elegibilidad restringida',
  'statuses.upcoming': 'Anunciada, todavía no abre',
  'styles.knowledge': 'Examen de preguntas',
  'styles.practical': 'Práctico',
  'styles.hybrid': 'Preguntas y labs',
  'roles.developer': 'Desarrollo de software',
  'roles.architect': 'Arquitectura de soluciones',
  'roles.ml-engineer': 'Ingeniería de ML',
  'roles.data-engineer': 'Ingeniería de datos',
  'roles.platform': 'Plataforma / DevOps',
  'roles.security': 'Seguridad',
  'roles.governance': 'Riesgo y gobernanza',
  'roles.business': 'Negocio / no técnico',
  'skills.llm-apps': 'Aplicaciones con LLM',
  'skills.agents': 'Agentes de IA',
  'skills.mcp': 'Model Context Protocol',
  'skills.prompting': 'Prompting y contexto',
  'skills.rag': 'Recuperación (RAG)',
  'skills.evaluation': 'Evaluación y testing',
  'skills.ml-foundations': 'Fundamentos de ML',
  'skills.deep-learning': 'Deep learning y entrenamiento',
  'skills.multimodal': 'IA multimodal',
  'skills.data': 'Ingeniería de datos',
  'skills.python': 'Python',
  'skills.architecture': 'Arquitectura de soluciones',
  'skills.aws': 'AWS',
  'skills.azure': 'Azure',
  'skills.gcp': 'Google Cloud',
  'skills.oci': 'Oracle Cloud',
  'skills.kubernetes': 'Kubernetes y contenedores',
  'skills.iac': 'Infraestructura como código',
  'skills.devops': 'CI/CD y flujos de desarrollo',
  'skills.observability': 'Observabilidad',
  'skills.gpu-infra': 'GPU e infraestructura de IA',
  'skills.networking': 'Redes',
  'skills.security': 'Ingeniería de seguridad',
  'skills.identity': 'Identidad y acceso',
  'skills.ai-security': 'Seguridad de IA y red teaming',
  'skills.governance': 'Gobernanza y riesgo de IA',
  'skills.simulation': '3D y simulación',
};

const ES_HOURS_NOTE =
  'Rangos aproximados por nivel para planificar, no promedios medidos ni cifras de los emisores. Tu punto de partida importa más: hacé un diagnóstico primero y ajustá.';

const DATES = {
  en: {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    dow: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  },
  es: {
    months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    days: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    dayNames: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    dow: ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'],
  },
};

// Text produced by lib/match.js and lib/planner.js, which stay English so the tests stay stable.
const ES_PATTERNS = [
  [/^Covers what you want to learn: (.*)$/, 'Cubre lo que querés aprender: $1'],
  [/^Aimed at (.*)$/, 'Pensada para $1'],
  [/^You already work with (.*)$/, 'Ya trabajás con $1'],
  [/^(.*) level fits your experience$/, 'El nivel $1 encaja con tu experiencia'],
  [/^(.*) level: above your stated experience$/, 'Nivel $1: por encima de tu experiencia'],
  [/^Assessment is (.*), not your preferred style$/, 'La evaluación es $1, no tu estilo preferido'],
  [/^No single USD price published; check the issuer for your region$/, 'No hay un precio único en USD; consultá al emisor para tu región'],
  [/^Announced but not open for booking yet$/, 'Anunciada, todavía no se puede reservar'],
  [/^Pick at least one study day$/, 'Elegí al menos un día de estudio'],
  [/^Hours must be positive$/, 'Las horas tienen que ser positivas'],
  [/^Sessions must be at least 15 minutes$/, 'Las sesiones tienen que durar al menos 15 minutos'],
  [/^guide and diagnostic$/, 'guía y diagnóstico'],
  [/^full exam( \d+)?$/, 'examen completo$1'],
  [/^mock (\d+)$/, 'simulacro $1'],
  [/^the mock$/, 'el simulacro'],
  [/^weak spots( \(\d+\/\d+\))?$/, 'puntos débiles$1'],
  [/^review and logistics$/, 'repaso y logística'],
  [/^Official exam objectives( \(\d+\/\d+\))?$/, 'Objetivos oficiales del examen$1'],
  [/^Core concepts( \(\d+\/\d+\))?$/, 'Conceptos centrales$1'],
  [/^Hands-on practice( \(\d+\/\d+\))?$/, 'Práctica guiada$1'],
];

const ES_DETAIL = {
  baseline: 'Leé la guía oficial del examen y hacé un diagnóstico corto.',
  learn: 'Estudiá de fuentes primarias. Anotá tres preguntas que todavía no podés responder.',
  practice: 'Labs o preguntas de escenario. Registrá cada error y por qué pasó.',
  mock: 'Duración completa ({min} min), cronometrado, sin apuntes.',
  review: 'Ordená cada error por tema y causa. Volvé a estudiar los dos temas más flojos.',
  remediate: 'Trabajá el registro de errores hasta que las preguntas parecidas salgan bien.',
  final: 'Repasá tus notas. Revisá tu documento, las reglas del examen y la prueba del sistema de supervisión.',
};

// Markdown export frame, passed to planner.toMarkdown as `text`.
const ES_MARKDOWN = {
  title: (p) => `# Plan de estudio: ${p.cert.name} (${p.cert.code})`,
  summary: (p) => `${p.sessions.length} sesiones, ${p.hours} horas en unas ${p.weeks} semana${p.weeks === 1 ? '' : 's'}.`,
  earliest: (p) => `Fecha de examen más temprana si mantenés el ritmo: **${p.examDate}**. Reservala solo cuando el último simulacro salga bien.`,
  fits: (d) => `Fecha objetivo ${d.targetDate}: entra, con ${d.spare} día${d.spare === 1 ? '' : 's'} de estudio de margen.`,
  noFit: (d) => `Fecha objetivo ${d.targetDate}: no entra. Hacen falta ${d.needed} sesiones y solo hay ${d.available} días de estudio.`,
  resources: 'Recursos',
  sessions: 'Sesiones',
  paid: ' (pago)',
  inferred: '> Los temas salen del resumen del alcance. Reemplazalos por los objetivos oficiales del examen.',
  footer: 'Generado con pathfinder: https://legiosai.github.io/pathfinder/',
};

const STR = { en, es };

function detect() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    /* storage blocked */
  }
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

let lang = detect();
document.documentElement.lang = lang;

export const getLang = () => lang;

export function setLang(next) {
  lang = next === 'es' ? 'es' : 'en';
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(KEY, JSON.stringify(lang));
  } catch {
    /* not saved this visit */
  }
}

/** Look up a string; {name} placeholders are filled from `vars`, functions get `vars` as their argument. */
export function t(key, vars = {}) {
  const s = STR[lang][key] ?? en[key] ?? key;
  if (typeof s === 'function') return s(vars);
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export const dates = () => DATES[lang];

/** Label for a taxonomy entry; `group` is levels, statuses, styles, roles or skills. */
export function label(group, entry) {
  return (lang === 'es' && ES_LABELS[`${group}.${entry.id}`]) || entry.label;
}

export const hoursNote = (fallback) => (lang === 'es' ? ES_HOURS_NOTE : fallback);

/** Translate a sentence produced by match.js or planner.js; unknown text passes through. */
export function lib(text) {
  if (lang !== 'es' || !text) return text;
  for (const [re, to] of ES_PATTERNS) if (re.test(text)) return text.replace(re, to);
  return text;
}

export function kindDetail(kind, fallback, minutes) {
  if (lang !== 'es') return fallback;
  return ES_DETAIL[kind].replace('{min}', minutes);
}

export const markdownText = () => (lang === 'es' ? ES_MARKDOWN : {});

/** Fill elements marked with data-i18n (text), data-i18n-html (markup) and data-i18n-attr ("attr:key;attr:key"). */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr.trim(), t(key.trim()));
    }
  }
}
