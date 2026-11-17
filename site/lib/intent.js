// "Describe what you want": read a goal written in plain English or Spanish and turn it into the
// profile "For me" builds from chips. Pure functions: no DOM, no storage and no network, so it runs on
// the device and Node tests can import it.
//
// It is a curated vocabulary with simple negation, not a language model. "Junior dev, want to get into
// cloud security, under $200, 5 hours a week" becomes signals (role developer, experience new, wants
// security, area Cloud & platform, budget 200, 5 h a week). Every signal keeps the words that produced
// it, so the interface can show what it understood and let people remove what it got wrong.

/** Catalog categories the vocabulary can point at. One without certifications yet simply matches nothing. */
export const AREAS = ['AI engineering', 'ML foundations', 'AI security', 'Cloud & platform', 'Cybersecurity', 'Data & analytics'];

const [AI, ML, AISEC, CLOUD, SEC, DATA] = AREAS;

/** Ceiling used for "cheap", "barato" and the like, in US dollars. */
export const CHEAP_USD = 150;

// ---------- vocabulary ----------
// Each row is [signal, ...phrases]. Phrases are written naturally and normalized at load time the same
// way the input is (lowercase, no accents, light plural stripping), so "agentes", "Agente" and
// "agents" all meet. The longest phrase wins at each position, so "seguridad de IA" beats "seguridad".

// Topics: skills (taxonomy ids), areas (categories) and issuers. `generic` marks broad words whose
// negation should leave a whole area out ("nothing cloud"), not only lower a few skills.
const TOPICS = [
  // AI engineering
  [{ skills: ['llm-apps'], areas: [AI, ML] }, 'generative ai', 'gen ai', 'genai', 'generative artificial intelligence', 'ia generativa', 'inteligencia artificial generativa', 'ai generativa', 'ia gen', 'foundation models', 'foundation model', 'modelos fundacionales', 'modelo fundacional'],
  [{ skills: ['llm-apps'], areas: [AI] }, 'llm', 'llms', 'large language models', 'large language model', 'language models', 'modelos de lenguaje', 'modelos de lenguaje grandes', 'chatgpt', 'gpt', 'openai', 'gemini', 'chatbot', 'chatbots', 'ai apps', 'ai applications', 'llm apps', 'llm applications', 'aplicaciones de ia', 'aplicaciones con ia', 'apps de ia', 'apps con ia', 'aplicaciones con llm', 'ai engineering', 'ingenieria de ia', 'ingenieria de inteligencia artificial', 'build with ai', 'building with ai', 'construir con ia', 'asistentes de ia', 'ai assistants'],
  [{ skills: ['agents'], areas: [AI] }, 'agents', 'ai agents', 'agentic', 'agentic ai', 'multi agent', 'multiagent', 'agentes', 'agentes de ia', 'agentes inteligentes', 'ia agentica', 'agentico', 'agentica', 'autonomous agents', 'agentes autonomos', 'crewai', 'autogen', 'tool calling', 'tool use', 'function calling', 'workflows con ia', 'ai workflows'],
  [{ skills: ['mcp'], areas: [AI] }, 'mcp', 'model context protocol', 'mcp servers', 'servidores mcp'],
  [{ skills: ['prompting'], areas: [AI] }, 'prompts', 'prompting', 'prompt engineering', 'ingenieria de prompts', 'context engineering', 'ingenieria de contexto', 'escribir prompts', 'writing prompts'],
  [{ skills: ['rag'], areas: [AI] }, 'rag', 'retrieval', 'retrieval augmented generation', 'vector database', 'vector databases', 'vector db', 'vector search', 'vector store', 'embeddings', 'semantic search', 'busqueda semantica', 'busqueda vectorial', 'bases vectoriales', 'base vectorial', 'base de datos vectorial', 'bases de datos vectoriales', 'recuperacion aumentada'],
  [{ skills: ['evaluation'], areas: [AI] }, 'evals', 'evaluation', 'llm evaluation', 'model evaluation', 'evaluacion', 'evaluacion de modelos', 'evaluar modelos', 'llm testing', 'ai testing', 'testing de ia', 'testing de llm', 'guardrails'],
  [{ skills: ['llm-apps', 'deep-learning'], areas: [AI, ML] }, 'fine tuning', 'finetuning', 'fine tune', 'ajuste fino', 'reentrenar modelos'],
  [{ skills: ['simulation'], areas: [AI] }, 'simulation', 'simulacion', '3d', 'omniverse', 'openusd', 'digital twin', 'digital twins', 'gemelo digital', 'gemelos digitales', 'robotics', 'robotica', 'robots'],

  // AI in general and ML foundations
  [{ skills: ['ml-foundations', 'llm-apps'], areas: [AI, ML], generic: true }, 'ai', 'ia', 'artificial intelligence', 'inteligencia artificial'],
  [{ skills: ['ml-foundations'], areas: [ML] }, 'machine learning', 'ml', 'aprendizaje automatico', 'aprendizaje de maquina', 'ai fundamentals', 'fundamentos de ia', 'fundamentos de inteligencia artificial', 'ml fundamentals', 'fundamentos de ml', 'fundamentos de machine learning', 'predictive models', 'predictive modeling', 'modelos predictivos', 'scikit learn', 'sklearn', 'estadistica', 'statistics'],
  [{ skills: ['ml-foundations', 'data', 'python'], areas: [ML, DATA] }, 'data science', 'ciencia de datos', 'ciencias de datos'],
  [{ skills: ['deep-learning'], areas: [ML] }, 'deep learning', 'aprendizaje profundo', 'neural networks', 'neural network', 'redes neuronales', 'red neuronal', 'pytorch', 'tensorflow', 'keras', 'transformers', 'model training', 'training models', 'train models', 'entrenar modelos', 'entrenamiento de modelos'],
  [{ skills: ['multimodal'], areas: [ML, AI] }, 'multimodal', 'computer vision', 'vision por computadora', 'vision por computador', 'vision artificial', 'image generation', 'generacion de imagenes', 'speech recognition', 'reconocimiento de voz', 'voice ai', 'ia de voz'],
  [{ skills: ['ml-foundations', 'devops'], areas: [ML, CLOUD] }, 'mlops', 'ml ops', 'llmops', 'aiops'],

  // Data & analytics
  [{ skills: ['data'], areas: [DATA], generic: true }, 'data', 'datos', 'data and analytics', 'datos y analitica', 'analytics', 'analitica', 'analitica de datos', 'data analytics', 'data analysis', 'analisis de datos', 'big data'],
  [{ skills: ['data'], areas: [DATA] }, 'data engineering', 'ingenieria de datos', 'data pipelines', 'pipelines de datos', 'etl', 'elt', 'data warehouse', 'data warehousing', 'lakehouse', 'data lake', 'spark', 'pyspark', 'sql', 'database', 'databases', 'bases de datos', 'base de datos', 'dbt', 'kafka', 'airflow', 'business intelligence', 'bi', 'power bi', 'tableau', 'looker', 'dashboards', 'tableros', 'reportes', 'reporting', 'data visualization', 'visualizacion de datos', 'excel', 'modelado de datos', 'data modeling'],
  [{ skills: ['python'] }, 'python', 'pandas', 'numpy', 'jupyter', 'programming', 'programacion', 'coding', 'code', 'programar', 'codear', 'codigo'],

  // Cloud & platform
  [{ areas: [CLOUD], generic: true }, 'cloud', 'nube', 'la nube', 'cloud computing', 'computacion en la nube', 'cloud platforms', 'plataformas cloud', 'cloud native', 'nativo de la nube', 'infrastructure', 'infraestructura', 'infra', 'servers', 'servidores', 'serverless', 'cloud migration', 'migracion a la nube', 'hybrid cloud', 'multicloud', 'multi cloud'],
  [{ skills: ['architecture'], areas: [] }, 'architecture', 'arquitectura', 'solution architecture', 'solutions architecture', 'arquitectura de soluciones', 'system design', 'systems design', 'diseno de sistemas', 'diseno de soluciones', 'software architecture', 'arquitectura de software'],
  [{ skills: ['architecture'], areas: [CLOUD] }, 'cloud architecture', 'arquitectura cloud', 'arquitectura en la nube', 'arquitectura de nube', 'arquitectura de la nube'],
  [{ skills: ['kubernetes'], areas: [CLOUD] }, 'kubernetes', 'k8s', 'kube', 'containers', 'container', 'contenedores', 'contenedor', 'docker', 'helm', 'container orchestration', 'orquestacion de contenedores', 'cloud native computing'],
  [{ skills: ['iac'], areas: [CLOUD] }, 'iac', 'infrastructure as code', 'infraestructura como codigo', 'ansible', 'cloudformation', 'pulumi', 'bicep', 'opentofu'],
  [{ skills: ['devops'], areas: [CLOUD], asRole: 'platform' }, 'devops', 'dev ops', 'cicd', 'ci cd', 'continuous integration', 'continuous delivery', 'continuous deployment', 'integracion continua', 'despliegue continuo', 'entrega continua', 'gitlab', 'jenkins', 'git', 'gitops', 'pipelines', 'release engineering', 'platform engineering', 'ingenieria de plataforma', 'automation', 'automatizacion'],
  [{ skills: ['observability'], areas: [CLOUD] }, 'observability', 'observabilidad', 'monitoring', 'monitoreo', 'monitorizacion', 'opentelemetry', 'otel', 'prometheus', 'grafana', 'logging', 'logs', 'tracing', 'trazas', 'telemetry', 'telemetria', 'apm'],
  [{ skills: ['gpu-infra'], areas: [CLOUD] }, 'gpu', 'gpus', 'ai infrastructure', 'infraestructura de ia', 'infraestructura para ia', 'ai infra', 'hpc', 'high performance computing', 'data center', 'datacenter', 'data centers', 'centro de datos', 'centros de datos', 'ai factory', 'inference', 'inferencia', 'model serving', 'triton'],
  [{ skills: ['networking'], areas: [CLOUD] }, 'networking', 'networks', 'network', 'redes', 'redes de computadoras', 'redes informaticas', 'tcp ip', 'routing', 'switching', 'enrutamiento', 'dns', 'vpn', 'infiniband', 'conectividad', 'connectivity'],

  // Cybersecurity
  [{ skills: ['security'], areas: [SEC], generic: true }, 'security', 'cybersecurity', 'cyber security', 'cyber', 'ciberseguridad', 'seguridad', 'seguridad informatica', 'seguridad de la informacion', 'information security', 'infosec', 'it security'],
  [{ skills: ['security'], areas: [SEC] }, 'hacking', 'ethical hacking', 'hacking etico', 'pentesting', 'pentest', 'pen testing', 'penetration testing', 'pruebas de penetracion', 'test de penetracion', 'tests de penetracion', 'red team', 'red teaming', 'blue team', 'purple team', 'defensive security', 'seguridad ofensiva', 'seguridad defensiva', 'soc', 'siem', 'threat hunting', 'threat intelligence', 'threats', 'amenazas', 'forensics', 'forense', 'informatica forense', 'incident response', 'respuesta a incidentes', 'malware', 'vulnerabilities', 'vulnerabilidades', 'appsec', 'application security', 'seguridad de aplicaciones', 'bug bounty', 'ctf', 'exploits', 'secops', 'detection engineering'],
  [{ skills: ['security', 'devops'], areas: [SEC, CLOUD] }, 'devsecops'],
  [{ skills: ['security'], areas: [SEC, CLOUD] }, 'cloud security', 'seguridad en la nube', 'seguridad de la nube', 'seguridad en nube', 'seguridad cloud', 'seguridad en cloud', 'secure cloud'],
  [{ skills: ['security', 'networking'], areas: [SEC] }, 'network security', 'seguridad de redes', 'seguridad en redes', 'seguridad de red', 'seguridad de la red', 'firewall', 'firewalls'],
  [{ skills: ['identity'], areas: [SEC] }, 'iam', 'identity', 'identidad', 'identidades', 'identity and access', 'identity management', 'access management', 'gestion de identidades', 'gestion de identidad', 'gestion de accesos', 'access control', 'control de acceso', 'active directory', 'entra id', 'okta', 'sso', 'single sign on', 'zero trust', 'authentication', 'autenticacion', 'oauth'],
  [{ skills: ['ai-security'], areas: [AISEC] }, 'ai security', 'security for ai', 'security of ai', 'seguridad de ia', 'seguridad de la ia', 'seguridad en ia', 'seguridad en la ia', 'seguridad para ia', 'seguridad de inteligencia artificial', 'seguridad de la inteligencia artificial', 'llm security', 'seguridad de llm', 'seguridad en llm', 'ai red teaming', 'ai red team', 'red teaming de ia', 'red team de ia', 'llm red teaming', 'prompt injection', 'inyeccion de prompts', 'jailbreak', 'jailbreaks', 'jailbreaking', 'adversarial', 'adversarial ml', 'model security', 'secure ai', 'securing ai', 'ia segura', 'owasp llm', 'ai pentesting', 'pentesting de ia', 'hacking de ia', 'ai hacking', 'agent security', 'seguridad de agentes'],
  [{ skills: ['governance'], areas: [AISEC, SEC] }, 'governance', 'gobernanza', 'risk', 'riesgo', 'risk management', 'gestion de riesgos', 'compliance', 'cumplimiento', 'cumplimiento normativo', 'regulation', 'regulacion', 'normativa', 'privacy', 'privacidad', 'gdpr', 'data protection', 'proteccion de datos', 'audit', 'auditoria', 'grc', 'nist'],
  [{ skills: ['governance'], areas: [AISEC] }, 'ai governance', 'gobernanza de ia', 'gobernanza de la ia', 'ai risk', 'riesgos de ia', 'ai act', 'eu ai act', 'iso 42001', 'responsible ai', 'ia responsable', 'ai ethics', 'etica de la ia', 'etica en ia', 'ethics', 'etica', 'trustworthy ai', 'ia confiable'],

  // Issuers. A positive mention adds the skills (if any) and prefers the issuer; a negative one leaves it out.
  [{ skills: ['aws'], provider: 'AWS' }, 'aws', 'amazon', 'amazon web services'],
  [{ skills: ['aws', 'llm-apps'], provider: 'AWS' }, 'bedrock', 'amazon bedrock'],
  [{ skills: ['aws', 'ml-foundations'], provider: 'AWS' }, 'sagemaker'],
  [{ skills: ['azure'] }, 'azure', 'microsoft azure', 'ms azure'],
  [{ skills: ['azure', 'llm-apps'] }, 'azure openai', 'azure ai', 'azure ai foundry'],
  [{ provider: 'Microsoft' }, 'microsoft', 'power platform'],
  [{ skills: ['gcp'], provider: 'Google Cloud' }, 'google', 'google cloud', 'gcp', 'google cloud platform'],
  [{ skills: ['gcp', 'ml-foundations'], provider: 'Google Cloud' }, 'vertex', 'vertex ai'],
  [{ skills: ['gcp', 'data'], provider: 'Google Cloud' }, 'bigquery'],
  [{ skills: ['oci'], provider: 'Oracle' }, 'oracle', 'oci', 'oracle cloud'],
  [{ provider: 'NVIDIA' }, 'nvidia'],
  [{ skills: ['gpu-infra'], provider: 'NVIDIA' }, 'cuda'],
  [{ skills: ['llm-apps'], provider: 'Anthropic', restricted: true }, 'anthropic', 'claude', 'claude code'],
  [{ skills: ['data'], provider: 'Databricks' }, 'databricks'],
  [{ skills: ['data'], provider: 'Snowflake' }, 'snowflake', 'snowpro'],
  [{ provider: 'Linux Foundation' }, 'linux foundation', 'the linux foundation', 'lf'],
  [{ skills: ['kubernetes'], provider: 'Linux Foundation' }, 'cncf'],
  [{ skills: ['kubernetes'], provider: 'Linux Foundation', code: true }, 'cka', 'ckad', 'kcna', 'cks'],
  [{ provider: 'GitHub' }, 'github'],
  [{ skills: ['devops'], provider: 'GitHub' }, 'github actions'],
  [{ skills: ['llm-apps', 'devops'], provider: 'GitHub' }, 'copilot', 'github copilot'],
  [{ provider: 'HashiCorp' }, 'hashicorp'],
  [{ skills: ['iac'], provider: 'HashiCorp' }, 'terraform'],
  [{ provider: 'Red Hat' }, 'red hat', 'redhat', 'rhel'],
  [{ provider: 'Red Hat', code: true }, 'rhcsa', 'rhce'],
  [{ skills: ['kubernetes'], provider: 'Red Hat' }, 'openshift'],
  [{ skills: ['agents'], provider: 'LangChain' }, 'langchain', 'langgraph', 'langsmith'],
  [{ skills: ['security'], provider: 'OffSec' }, 'offsec', 'offensive security'],
  [{ skills: ['security'], provider: 'OffSec', code: true }, 'oscp', 'oswe', 'osep'],
  [{ provider: 'GIAC' }, 'giac', 'sans'],
  [{ skills: ['governance'], provider: 'IAPP' }, 'iapp'],
  [{ skills: ['governance'], provider: 'IAPP', code: true }, 'aigp', 'cipp', 'cipt', 'cipm'],
  [{ provider: 'Cloud Security Alliance' }, 'cloud security alliance', 'csa'],
  [{ skills: ['security'], provider: 'Cloud Security Alliance', code: true }, 'ccsk'],
  [{ provider: 'Securiti' }, 'securiti'],
  [{ skills: ['security'], provider: 'TCM Security' }, 'tcm', 'tcm security'],
  [{ provider: 'CompTIA' }, 'comptia'],
  [{ skills: ['security'], provider: 'CompTIA', code: true }, 'securityplus', 'security plus', 'sec plus', 'pentestplus', 'pentest plus', 'cysaplus', 'cysa', 'caspplus', 'securityx'],
  [{ skills: ['networking'], provider: 'CompTIA', code: true }, 'networkplus', 'network plus'],
  [{ skills: ['security'], provider: 'ISC2' }, 'isc2'],
  [{ skills: ['security'], provider: 'ISC2', code: true }, 'cissp', 'ccsp', 'sscp'],
  [{ skills: ['security', 'governance'], provider: 'ISACA' }, 'isaca'],
  [{ skills: ['security', 'governance'], provider: 'ISACA', code: true }, 'cisa', 'cism', 'crisc'],
  [{ skills: ['security'], provider: 'EC-Council' }, 'ec council', 'eccouncil'],
  [{ skills: ['security'], provider: 'EC-Council', code: true }, 'ceh'],
  [{ skills: ['security'], provider: 'Hack The Box' }, 'hack the box', 'hackthebox', 'htb'],
  [{ skills: ['security'], provider: 'INE' }, 'ine'],
  [{ skills: ['security'], provider: 'INE', code: true }, 'ejpt'],
  [{ skills: ['networking'], provider: 'Cisco' }, 'cisco'],
  [{ skills: ['networking'], provider: 'Cisco', code: true }, 'ccna', 'ccnp'],
];

// Roles. `implies` applies only when the role is a goal ("I want to become a data engineer"),
// not when it describes the present ("I'm a data engineer").
const ROLES = [
  [{ roles: ['developer'] }, 'developer', 'dev', 'software developer', 'software engineer', 'software engineering', 'programmer', 'coder', 'web developer', 'web dev', 'backend', 'backend developer', 'frontend', 'frontend developer', 'full stack', 'fullstack', 'full stack developer', 'mobile developer', 'desarrollador', 'desarrolladora', 'programador', 'programadora', 'ingeniero de software', 'ingeniera de software', 'desarrollo de software', 'desarrollo web', 'desarrollador web', 'desarrolladora web'],
  [{ roles: ['architect'], implies: { skills: ['architecture'] } }, 'architect', 'solutions architect', 'solution architect', 'software architect', 'enterprise architect', 'arquitecto', 'arquitecta', 'arquitecto de soluciones', 'arquitecta de soluciones', 'arquitecto de software', 'arquitecta de software'],
  [{ roles: ['architect'], implies: { skills: ['architecture'], areas: [CLOUD] } }, 'cloud architect', 'arquitecto cloud', 'arquitecta cloud', 'arquitecto de nube', 'arquitecto de la nube', 'arquitecto en la nube', 'arquitecto en cloud'],
  [{ roles: ['architect', 'security'], implies: { skills: ['architecture', 'security'], areas: [SEC] } }, 'security architect', 'arquitecto de seguridad', 'arquitecta de seguridad'],
  [{ roles: ['platform'], implies: { areas: [CLOUD] } }, 'cloud engineer', 'ingeniero cloud', 'ingeniera cloud', 'ingeniero de nube', 'ingeniero en la nube', 'ingeniero de cloud', 'cloud admin', 'cloud administrator', 'administrador cloud'],
  [{ roles: ['platform'], implies: { skills: ['devops'], areas: [CLOUD] } }, 'devops engineer', 'ingeniero devops', 'ingeniera devops', 'devops specialist', 'sre', 'site reliability', 'site reliability engineer', 'platform engineer', 'ingeniero de plataforma', 'ingeniera de plataforma', 'infrastructure engineer', 'ingeniero de infraestructura', 'ingeniera de infraestructura', 'sysadmin', 'sys admin', 'system administrator', 'systems administrator', 'administrador de sistemas', 'administradora de sistemas', 'operations engineer', 'it ops', 'it operations'],
  [{ roles: ['platform'] }, 'it support', 'support engineer', 'help desk', 'helpdesk', 'mesa de ayuda', 'soporte tecnico', 'tecnico de soporte', 'soporte it'],
  [{ roles: ['platform'], implies: { skills: ['networking'], areas: [CLOUD] } }, 'network engineer', 'network administrator', 'ingeniero de redes', 'ingeniera de redes', 'administrador de redes', 'administradora de redes'],
  [{ roles: ['ml-engineer'], implies: { skills: ['ml-foundations'], areas: [ML] } }, 'ml engineer', 'machine learning engineer', 'ingeniero de ml', 'ingeniera de ml', 'ingeniero de machine learning', 'ingeniera de machine learning', 'mle', 'researcher', 'ai researcher', 'ml researcher', 'investigador', 'investigadora'],
  [{ roles: ['ml-engineer', 'developer'], implies: { skills: ['llm-apps'], areas: [AI] } }, 'ai engineer', 'ai developer', 'ingeniero de ia', 'ingeniera de ia', 'desarrollador de ia', 'desarrolladora de ia', 'llm engineer', 'genai engineer', 'prompt engineer'],
  [{ roles: ['ml-engineer', 'data-engineer'], implies: { skills: ['ml-foundations', 'data'], areas: [ML, DATA] } }, 'data scientist', 'cientifico de datos', 'cientifica de datos'],
  [{ roles: ['data-engineer'], implies: { skills: ['data'], areas: [DATA] } }, 'data engineer', 'ingeniero de datos', 'ingeniera de datos', 'data analyst', 'analista de datos', 'bi analyst', 'analista bi', 'analista de bi', 'bi developer', 'desarrollador bi', 'analytics engineer', 'dba', 'database administrator', 'administrador de bases de datos', 'administrador de base de datos'],
  [{ roles: ['security'], implies: { skills: ['security'], areas: [SEC] } }, 'security engineer', 'security analyst', 'soc analyst', 'analista soc', 'analista de seguridad', 'ingeniero de seguridad', 'ingeniera de seguridad', 'pentester', 'pen tester', 'ethical hacker', 'hacker etico', 'hacker', 'red teamer', 'security researcher', 'investigador de seguridad', 'ciso', 'security consultant', 'consultor de seguridad', 'consultora de seguridad', 'especialista en seguridad', 'especialista en ciberseguridad'],
  [{ roles: ['governance'], implies: { skills: ['governance'], areas: [AISEC] } }, 'risk manager', 'risk analyst', 'compliance officer', 'compliance analyst', 'auditor', 'auditora', 'grc analyst', 'privacy officer', 'dpo', 'lawyer', 'abogado', 'abogada', 'oficial de cumplimiento', 'analista de riesgos', 'analista de riesgo', 'analista de cumplimiento'],
  [{ roles: ['business'] }, 'manager', 'gerente', 'product manager', 'project manager', 'product owner', 'scrum master', 'jefe', 'jefa', 'director', 'directora', 'executive', 'ejecutivo', 'ejecutiva', 'founder', 'fundador', 'fundadora', 'emprendedor', 'emprendedora', 'business', 'negocio', 'negocios', 'non technical', 'not technical', 'no tecnico', 'no tecnica', 'sales', 'ventas', 'marketing', 'consultant', 'consultor', 'consultora', 'recruiter', 'reclutador', 'reclutadora', 'business analyst', 'analista de negocio', 'analista funcional', 'recursos humanos'],
];

// Experience: new (entry level), some (1–3 years) or experienced (3+ years), as in "For me".
const LEVELS = [
  [{ level: 'new' }, 'beginner', 'beginners', 'newbie', 'noob', 'novice', 'starting out', 'just starting', 'just started', 'getting started', 'starting from scratch', 'from scratch', 'from zero', 'new to', 'new in', 'no experience', 'no prior experience', 'without experience', 'little experience', 'not much experience', 'dont have experience', 'dont have much experience', 'entry level', 'entry', 'junior', 'jr', 'student', 'students', 'intern', 'internship', 'trainee', 'fresher', 'graduate', 'recent graduate', 'first job', 'first certification', 'first cert', 'basic', 'basics', 'fundamentals', 'foundational', 'intro', 'introductory', 'easy', 'nothing too advanced', 'not too advanced', 'not too hard', 'nothing too hard', 'career change', 'career changer', 'changing careers', 'dont know anything', 'principiante', 'principiantes', 'novato', 'novata', 'desde cero', 'de cero', 'sin experiencia', 'poca experiencia', 'no tengo experiencia', 'no tengo mucha experiencia', 'recien empiezo', 'recien empezando', 'recien arranco', 'estoy empezando', 'empezando', 'arrancando', 'nuevo en', 'nueva en', 'nivel inicial', 'inicial', 'basico', 'basica', 'nivel basico', 'fundamentos', 'introductorio', 'introductoria', 'facil', 'sencillo', 'sencilla', 'estudiante', 'pasante', 'pasantia', 'primer trabajo', 'primer empleo', 'primera certificacion', 'mi primera certificacion', 'nada muy avanzado', 'nada demasiado avanzado', 'nada avanzado', 'no muy dificil', 'nada muy dificil', 'cambio de carrera', 'no se nada', 'menos de un ano', 'less than a year'],
  [{ level: 'some' }, 'intermediate', 'mid', 'mid level', 'midlevel', 'some experience', 'a bit of experience', 'a couple of years', 'associate level', 'intermedio', 'intermedia', 'nivel intermedio', 'semi senior', 'semisenior', 'semi sr', 'ssr', 'algo de experiencia', 'un par de anos', 'nivel asociado'],
  [{ level: 'experienced' }, 'senior', 'sr', 'advanced', 'expert', 'experts', 'experienced', 'lots of experience', 'a lot of experience', 'many years', 'veteran', 'tech lead', 'team lead', 'staff engineer', 'principal engineer', 'professional level', 'expert level', 'difficult', 'challenging', 'avanzado', 'avanzada', 'experto', 'experta', 'experimentado', 'experimentada', 'mucha experiencia', 'muchos anos', 'lider tecnico', 'lider tecnica', 'nivel profesional', 'nivel experto', 'nivel avanzado', 'dificil', 'desafiante'],
];

const BUDGET = [
  [{ budget: 0 }, 'free', 'for free', 'free of charge', 'gratis', 'gratuito', 'gratuita', 'gratuitos', 'gratuitas', 'sin costo', 'sin coste', 'costo cero', 'no cost', 'zero cost', 'no money', 'sin plata', 'sin dinero', 'sin pagar', 'without paying', 'no budget', 'zero budget', 'sin presupuesto', 'presupuesto cero', 'no puedo pagar', 'cant pay', 'cant afford'],
  [{ cheap: true }, 'cheap', 'cheaper', 'cheapest', 'affordable', 'inexpensive', 'low cost', 'low price', 'low budget', 'budget friendly', 'on a budget', 'tight budget', 'limited budget', 'not expensive', 'not too expensive', 'nothing expensive', 'barato', 'barata', 'baratos', 'baratas', 'economico', 'economica', 'economicos', 'economicas', 'accesible', 'accesibles', 'bajo costo', 'bajo precio', 'bajo presupuesto', 'poco presupuesto', 'presupuesto ajustado', 'presupuesto limitado', 'poca plata', 'poco dinero', 'no muy caro', 'no muy cara', 'no tan caro', 'no tan cara', 'nada caro', 'nada muy caro', 'que no sea caro', 'que no sea cara', 'que no sean caras', 'que no sean caros'],
  [{ anyBudget: true }, 'money is not an issue', 'money is no object', 'money is not a problem', 'price doesnt matter', 'price does not matter', 'any price', 'any budget', 'no budget limit', 'no budget constraints', 'no budget constraint', 'unlimited budget', 'budget is not a problem', 'company pays', 'my company pays', 'employer pays', 'my employer pays', 'sin limite de presupuesto', 'presupuesto ilimitado', 'no me importa el precio', 'el precio no importa', 'no importa el precio', 'cualquier precio', 'paga la empresa', 'la empresa paga', 'me lo paga la empresa', 'mi empresa paga', 'lo paga mi empresa', 'doesnt have to be free', 'does not have to be free', 'no tiene que ser gratis', 'no hace falta que sea gratis', 'no necesita ser gratis'],
  // Only meaningful when negated: "nothing expensive", "nada caro".
  [{ expensive: true }, 'expensive', 'pricey', 'caro', 'cara', 'caros', 'caras', 'costoso', 'costosa', 'costosos', 'costosas'],
];

const EXTRAS = [
  [{ practice: true }, 'practice questions', 'practice question', 'practice tests', 'practice test', 'practice exams', 'practice exam', 'mock exams', 'mock exam', 'mock tests', 'mock test', 'mocks', 'sample questions', 'question bank', 'preguntas de practica', 'preguntas para practicar', 'examenes de practica', 'examen de practica', 'examenes de prueba', 'examen de prueba', 'simulacros', 'simulacro', 'tests de practica', 'test de practica', 'para practicar', 'practicar', 'practica', 'practice', 'with practice', 'con practica'],
  [{ style: 'practical' }, 'hands on', 'hands on exam', 'practical', 'practical exam', 'performance based', 'lab based', 'labs', 'lab exam', 'laboratorios', 'laboratorio', 'examen practico', 'examenes practicos', 'practico', 'certificacion practica', 'certificaciones practicas', 'algo practico', 'mas practico'],
  [{ style: 'knowledge' }, 'multiple choice', 'multiple choice questions', 'multiple choice exam', 'opcion multiple', 'multiple opcion', 'question based', 'questions only', 'solo preguntas', 'theory', 'theoretical', 'teoria', 'teorico', 'teorica', 'examen teorico', 'knowledge exam'],
  [{ weeks: 4 }, 'next month', 'this month', 'el mes que viene', 'el proximo mes', 'proximo mes', 'este mes'],
];

// Words that steer how the topics around them are read. `weak` known-cues ("use", "know") do not
// override an explicit goal in the same clause ("I want to learn to use Kubernetes").
const CUES = [
  [{ cue: 'want' }, 'want', 'wanna', 'want to', 'would like', 'id like', 'like to', 'love to', 'hope to', 'plan to', 'planning to', 'learn', 'learning', 'to learn', 'get into', 'getting into', 'go into', 'move into', 'moving into', 'move to', 'switch to', 'switch into', 'switching to', 'transition', 'transition to', 'transition into', 'pivot', 'pivot to', 'pivot into', 'break into', 'into', 'interested', 'interested in', 'interest in', 'focus on', 'focused on', 'focusing on', 'specialize', 'specialize in', 'specialise in', 'become', 'becoming', 'career in', 'aim', 'aiming', 'aiming for', 'looking for', 'looking to', 'look for', 'seeking', 'explore', 'exploring', 'study', 'studying', 'improve', 'upskill', 'get certified', 'certified in', 'certification in', 'certification for', 'cert in', 'certify', 'my goal', 'goal', 'need', 'i need', 'something in', 'something about', 'something for', 'something on', 'recommend', 'suggest', 'dive into', 'deepen', 'grow in', 'get better at',
    'quiero', 'quisiera', 'queria', 'me gustaria', 'gustaria', 'me encantaria', 'aprender', 'aprender sobre', 'meterme', 'meterme en', 'entrar', 'entrar en', 'entrar a', 'pasarme', 'pasarme a', 'cambiarme', 'cambiarme a', 'moverme', 'moverme a', 'migrar a', 'me interesa', 'me interesan', 'interesa', 'interesado', 'interesada', 'interesado en', 'interesada en', 'interes en', 'enfocarme', 'enfocarme en', 'especializarme', 'especializarme en', 'dedicarme', 'dedicarme a', 'certificarme', 'certificarme en', 'certificacion en', 'certificacion de', 'estudiar', 'busco', 'buscando', 'estoy buscando', 'necesito', 'apuntar a', 'orientarme', 'mejorar', 'mejorar en', 'crecer en', 'profundizar', 'profundizar en', 'convertirme en', 'llegar a ser', 'algo de', 'algo en', 'algo para', 'algo sobre', 'recomendame', 'recomendacion', 'arrancar con', 'empezar con', 'empezar en', 'formarme en', 'capacitarme en', 'objetivo'],
  [{ cue: 'known' }, 'i know', 'i already know', 'already know', 'i use', 'i already use', 'already use', 'already using', 'i work with', 'i worked with', 'worked with', 'i work in', 'i have experience with', 'i have experience in', 'experience with', 'experience in', 'experienced with', 'experienced in', 'familiar with', 'background in', 'comfortable with', 'good at', 'proficient in', 'skilled in', 'i code in', 'i program in', 'coming from', 'come from', 'i come from', 'i manage', 'i administer', 'currently use', 'currently using', 'i have', 'ive got', 'i already have', 'already have', 'i passed', 'i hold',
    'ya se', 'se usar', 'uso', 'ya uso', 'trabajo en', 'trabajo en el area de', 'utilizo', 'ya utilizo', 'manejo', 'ya manejo', 'me manejo con', 'domino', 'conozco', 'ya conozco', 'trabajo con', 'trabaje con', 'trabajando con', 'estoy trabajando con', 'laburo con', 'tengo experiencia en', 'tengo experiencia con', 'experiencia en', 'experiencia con', 'vengo de', 'programo en', 'administro', 'se algo de', 'ya tengo', 'tengo la', 'tengo el', 'aprobe', 'ya aprobe', 'ya rendi'],
  [{ cue: 'known', weak: true }, 'know', 'use', 'using', 'work with', 'working with', 'work in', 'familiar'],
  [{ cue: 'neg' }, 'no', 'not', 'dont', 'do not', 'doesnt', 'does not', 'never', 'nothing', 'none', 'avoid', 'avoiding', 'except', 'excluding', 'exclude', 'other than', 'anything but', 'rather not', 'would rather not', 'id rather not', 'skip', 'without', 'not interested', 'not interested in', 'dont want', 'do not want', 'dont wanna', 'dont like', 'dont care about', 'hate', 'nor', 'no more',
    'sin', 'nada', 'nada de', 'ni', 'excepto', 'salvo', 'menos', 'evitar', 'evito', 'evitaria', 'odio', 'no quiero', 'no quisiera', 'no me interesa', 'no me interesan', 'no me gusta', 'no me gustan', 'no me gustaria', 'que no sea', 'que no sean', 'fuera de', 'sacando', 'prefiero no', 'nunca', 'tampoco'],
  [{ cue: 'reset' }, 'but', 'however', 'though', 'although', 'instead', 'rather', 'prefer', 'i prefer', 'preferably', 'ideally', 'because', 'since', 'so', 'also', 'plus', 'otherwise',
    'pero', 'sino', 'sino que', 'aunque', 'en cambio', 'en su lugar', 'mas bien', 'prefiero', 'preferiblemente', 'preferentemente', 'idealmente', 'porque', 'ya que', 'asi que', 'entonces', 'tambien', 'ademas'],
  [{ cue: 'current' }, 'im', 'i am', 'i work as', 'work as', 'working as', 'currently', 'my role', 'my job', 'my position', 'soy', 'trabajo como', 'trabajo de', 'me desempeno como', 'mi rol', 'mi trabajo', 'mi puesto', 'actualmente'],
  // Phrases that look negative or like a topic but are neither.
  [{ cue: 'neutral' }, 'not only', 'not just', 'no solo', 'no solamente', 'no matter', 'no problem', 'no se', 'i dont know', 'not sure', 'no estoy seguro', 'no estoy segura', 'no idea', 'ni idea', 'no tengo idea', 'al menos', 'por lo menos', 'mas o menos', 'more or less', 'free time', 'free weekends', 'feel free', 'free day', 'free days', 'free hours', 'tiempo libre', 'free tier', 'capa gratuita', 'best practices', 'buenas practicas', 'in practice', 'en la practica', 'no rush', 'sin apuro', 'sin prisa', 'become an expert', 'be an expert', 'ser experto', 'ser experta', 'convertirme en experto', 'convertirme en experta'],
];

// ---------- text handling ----------

/** Lowercase, strip accents and apostrophes ("Dólares" → "dolares", "don't" → "dont"). */
export function normalize(text) {
  return String(text ?? '')
    .slice(0, 2000)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`´]/g, '');
}

// Light plural and gender-free stripping, applied the same way to the vocabulary and to the input:
// "agentes" / "agents" / "agente" → "agent", "redes" → "red", "contenedores" → "contenedor".
function stem(word) {
  let w = word;
  if (w.length > 3 && w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length >= 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

const PRE = [
  [/\bci\s*\/\s*cd\b/g, 'cicd'],
  [/\bc\+\+/g, 'cpp'],
  [/\bc#/g, 'csharp'],
  [/\(isc\)\s*[2²]/g, 'isc2'],
  [/\b(security|network|pentest|cysa|casp|cloud|linux|data)\s*\+/g, '$1plus'],
  [/&/g, ' and '],
  [/[/_\-–—]/g, ' '],
];

const PUNCT = new Set(['.', ',', ';', ':', '!', '?', '¡', '¿', '(', ')', '\n']);

function tokenize(norm) {
  let s = norm;
  for (const [re, to] of PRE) s = s.replace(re, to);
  return (s.match(/[a-z0-9]+|[.,;:!?¡¿()\n]/g) || []).map((raw) => (PUNCT.has(raw) ? { raw, punct: true } : { raw, key: stem(raw) }));
}

const keyOf = (phrase) => tokenize(normalize(phrase)).filter((t) => !t.punct).map((t) => t.key).join(' ');

const LEXICON = new Map();
const CONFLICTS = [];
let MAX_LEN = 1;
for (const group of [CUES, LEVELS, BUDGET, EXTRAS, ROLES, TOPICS]) {
  for (const [entry, ...phrases] of group) {
    for (const p of phrases) {
      const k = keyOf(p);
      if (!k) continue;
      if (LEXICON.has(k)) {
        if (LEXICON.get(k) !== entry) CONFLICTS.push(p);
        continue;
      }
      LEXICON.set(k, entry);
      MAX_LEN = Math.max(MAX_LEN, k.split(' ').length);
    }
  }
}

/** What the parser knows: distinct phrases by kind, and the taxonomy ids and areas it can produce. */
export function vocabulary() {
  const count = (group) => group.reduce((n, [, ...p]) => n + p.length, 0);
  const entries = [...TOPICS, ...ROLES].map(([e]) => e);
  const ids = (pick) => [...new Set(entries.flatMap(pick))].sort();
  return {
    phrases: LEXICON.size,
    topics: count(TOPICS),
    roles: count(ROLES),
    levels: count(LEVELS),
    budget: count(BUDGET),
    extras: count(EXTRAS),
    cues: count(CUES),
    conflicts: [...CONFLICTS],
    skillIds: ids((e) => [...(e.skills || []), ...(e.implies?.skills || [])]),
    roleIds: ids((e) => [...(e.roles || []), ...(e.asRole ? [e.asRole] : [])]),
    areaNames: ids((e) => [...(e.areas || []), ...(e.implies?.areas || [])]),
  };
}

// ---------- numbers: budget, hours, years, deadline ----------

const NUMBER_WORDS = {
  'a couple of': 2, 'couple of': 2, 'un par de': 2, 'a few': 3, 'unas pocas': 3, 'unos pocos': 3,
  a: 1, an: 1, one: 1, un: 1, una: 1, uno: 1, two: 2, dos: 2, three: 3, tres: 3, four: 4, cuatro: 4, five: 5, cinco: 5,
  six: 6, seis: 6, seven: 7, siete: 7, eight: 8, ocho: 8, nine: 9, nueve: 9, ten: 10, diez: 10, twelve: 12, doce: 12,
  fifteen: 15, quince: 15, twenty: 20, veinte: 20, few: 3, pocas: 3, pocos: 3, several: 4, varios: 4, varias: 4, algunas: 3, algunos: 3, many: 8, muchos: 8, muchas: 8,
};
const MONEY_WORDS = {
  'a hundred': 100, 'one hundred': 100, 'two hundred': 200, 'three hundred': 300, 'four hundred': 400, 'five hundred': 500,
  'a thousand': 1000, 'one thousand': 1000, cien: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, mil: 1000,
};
const alt = (words) => Object.keys(words).sort((a, b) => b.length - a.length).map((w) => w.replace(/ /g, '\\s+')).join('|');
const NUM = `\\d+(?:[.,]\\d+)?|${alt(NUMBER_WORDS)}`;

function toNumber(s) {
  const w = s.replace(/\s+/g, ' ');
  if (w in NUMBER_WORDS) return NUMBER_WORDS[w];
  if (w in MONEY_WORDS) return MONEY_WORDS[w];
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(w)) return Number(w.replace(/[.,]/g, ''));
  return Number(w.replace(',', '.'));
}

const HOURS_RE = new RegExp(
  `\\b(${NUM})(?:\\s*(?:-|to|a|or|o)\\s*(\\d+(?:[.,]\\d+)?))?\\s*(?:h|hs|hrs?|hours?|horas?)\\b(?:\\s*(?:\\/|per|a|an|each|every|on|por|a la|al|cada|x|de|los|las|the)?\\s*(weeks?|wk|weekly|semanas?|semanal(?:es)?|days?|daily|dias?|diarias?|diarios?|weekends?|fines? de semana|finde|nights?|noches?|months?|mes(?:es)?|mensual(?:es)?)\\b)?`,
  'g',
);
const YEARS_RE = new RegExp(`\\b(${NUM})(?:\\s*(?:-|to|a)\\s*(\\d+))?\\s*(\\+)?\\s*(?:years?|yrs?|anos?)\\b`, 'g');
const MONTHS_EXP_RE = new RegExp(`\\b(${NUM})\\s*(?:months?|meses?)\\s+(?:of\\s+|de\\s+)?(?:experience|experiencia)`, 'g');
const SPAN_RE = new RegExp(`\\b(${NUM})\\s*(weeks?|semanas?|months?|mes(?:es)?)\\b`, 'g');
const MONEY_RE = /(us\s?\$|u\$[sd]|usd|\$)?\s*(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(\s*k\b)?/g;
const MONEY_WORDS_RE = new RegExp(`\\b(${alt(MONEY_WORDS)})\\b`, 'g');

const CURRENCY_AFTER = /^\s*(?:usd\b|us\s?\$|u\$[sd]|\$|dolares\b|dolar\b|dollars?\b|bucks\b|dlls?\b|dls\b)/;
const OTHER_CURRENCY = /^\s*(?:pesos?\b|ars\b|mxn\b|clp\b|cop\b|uyu\b|pen\b|soles\b|eur\b|euros?\b|€|reales\b|brl\b|gbp\b|libras?\b|pounds?\b|£)/;
const UNIT_AFTER = /^\s*(?:h\b|hs\b|hrs?\b|hours?\b|horas?\b|min\b|mins\b|minutes?\b|minutos?\b|weeks?\b|semanas?\b|months?\b|mes(?:es)?\b|years?\b|anos?\b|days?\b|dias?\b|questions?\b|preguntas?\b|%|percent\b|por ciento\b|people\b|personas\b|certs?\b|certifications?\b|certificaciones?\b)/;
const BUDGET_CUE = /(?:budget|presupuesto|under|below|less than|max|maximum|maximo|up to|upto|at most|no more than|not more than|not over|cheaper than|spend|pay|afford|menos de|hasta|no mas de|no mas que|por debajo de|que no pasen? de|que no supere|tope|limite|gastar|pagar|invertir|cuesten?|cueste|costar|cost|costs|<)\s*(?:(?:of|de|is|es|around|about|unos|unas|como|my|mi|el|los|a|an|un|una|only|solo|just|like|aprox|approx|approximately|aproximadamente|:|=|~)\s*){0,3}$/;
const RANGE_GAP = /^\s*(?:-|–|to|and|y|a|or|o)\s*$/;

// Blanks out spans already read. Split by UTF-16 unit, as regex indexes are, so emoji do not shift them.
function masker(text) {
  const chars = text.split('');
  return {
    hide(start, end) {
      for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
    },
    get text() {
      return chars.join('');
    },
  };
}

function scanNumbers(norm, signals) {
  const m = masker(norm);
  let text = norm;
  const run = (re, fn) => {
    re.lastIndex = 0;
    for (const hit of [...text.matchAll(re)]) if (fn(hit) !== false) m.hide(hit.index, hit.index + hit[0].length);
    text = m.text;
  };
  const left = (hit, n = 40) => text.slice(Math.max(0, hit.index - n), hit.index);
  const right = (hit, n = 40) => text.slice(hit.index + hit[0].length, hit.index + hit[0].length + n);

  run(HOURS_RE, (hit) => {
    const n = toNumber(hit[1]);
    const per = hit[3] || '';
    const factor = /^(?:days?|daily|dias?|diari|nights?|noches?)/.test(per) ? 7 : /^(?:months?|mes|mensual)/.test(per) ? 1 / 4.33 : 1;
    const value = Math.round(n * factor);
    if (!(value >= 1 && value <= 80) || /\btotal\b|\ben total\b/.test(right(hit, 12))) return false;
    signals.push({ type: 'hours', value, words: hit[0].trim() });
  });

  run(MONTHS_EXP_RE, (hit) => {
    signals.push({ type: 'level', value: 'new', words: hit[0].trim() });
  });

  run(YEARS_RE, (hit) => {
    const before = left(hit, 24);
    const after = right(hit, 30);
    if (/(?:\bin|\ben|within|dentro de|next|proximos?|after|despues de|cada|every)\s*$/.test(before)) return false;
    if (/^\s*(?:old\b|de edad\b)/.test(after)) return false;
    const context =
      hit[3] ||
      /^\s*(?:of\s+|de\s+)?(?:experience|experiencia|exp\b|in\b|en\b|as\b|como\b|working|trabajando|programming|programando|coding|doing|haciendo|de carrera|en el rubro|in the field|in tech|in it\b)/.test(after) ||
      /(?:\bfor|llevo|hace|over|more than|mas de|almost|casi|\bwith|\bcon|less than|menos de)\s*$/.test(before);
    if (!context) return false;
    let n = toNumber(hit[1]);
    if (/(?:less than|menos de|under|fewer than)\s*$/.test(before)) n -= 0.5;
    signals.push({ type: 'level', value: n < 1 ? 'new' : n < 3 ? 'some' : 'experienced', words: hit[0].trim() });
  });

  run(SPAN_RE, (hit) => {
    if (signals.some((s) => s.type === 'weeks')) return false;
    if (/(?:per|por|a la|al|cada|every|each|a|twice|once|times|veces)\s*$/.test(left(hit, 10))) return false;
    // "a week" alone is a rate ("twice a week"); "in a month", "en un mes" is a deadline.
    if (/^(?:an?|un|una)$/.test(hit[1]) && !/(?:\bin|within|\ben|dentro de|for|para|durante|over)\s*$/.test(left(hit, 16))) return false;
    if (/^\s*(?:of\s+|de\s+)?(?:experience|experiencia)/.test(right(hit))) return false;
    const n = toNumber(hit[1]);
    const weeks = /^(?:weeks?|semanas?)$/.test(hit[2]) ? Math.round(n) : Math.round(n * 4.33);
    if (!(weeks >= 1 && weeks <= 104)) return false;
    signals.push({ type: 'weeks', value: weeks, words: hit[0].trim() });
  });

  // Money: a currency mark or word next to the number, or a budget word before it ("under 200").
  const found = [];
  for (const hit of text.matchAll(MONEY_RE)) {
    const start = hit.index + hit[0].indexOf(hit[2]);
    const before = text.slice(0, hit[1] ? hit.index : start);
    if (!hit[1] && /[a-z]$|[a-z]\s?[-–]$/.test(before.slice(-2))) continue; // codes such as AZ-900, k8s
    const after = text.slice(hit.index + hit[0].length);
    if (/^[a-z]/.test(after) && !CURRENCY_AFTER.test(after)) continue; // "2nd", "5x"
    if (OTHER_CURRENCY.test(after) || UNIT_AFTER.test(after)) continue;
    const marked = Boolean(hit[1]) || CURRENCY_AFTER.test(after);
    found.push({ start: hit.index, end: hit.index + hit[0].length, value: toNumber(hit[2]) * (hit[3] ? 1000 : 1), ok: marked || BUDGET_CUE.test(before.slice(-48)) });
  }
  for (const hit of text.matchAll(MONEY_WORDS_RE)) {
    const after = text.slice(hit.index + hit[0].length);
    if (OTHER_CURRENCY.test(after)) continue;
    found.push({ start: hit.index, end: hit.index + hit[0].length, value: toNumber(hit[1]), ok: CURRENCY_AFTER.test(after) || BUDGET_CUE.test(text.slice(Math.max(0, hit.index - 48), hit.index)) });
  }
  found.sort((a, b) => a.start - b.start);
  // "100-300 USD", "entre 100 y 300 dólares": a range counts once, at its top.
  for (let i = 0; i + 1 < found.length; i++) {
    const a = found[i];
    const b = found[i + 1];
    if ((a.ok || b.ok) && RANGE_GAP.test(text.slice(a.end, b.start).replace(/us\s?\$|\$|usd/g, ''))) {
      found.splice(i, 2, { start: a.start, end: b.end, value: Math.max(a.value, b.value), ok: true });
      i--;
    }
  }
  for (const f of found) {
    if (!f.ok || !(f.value >= 0) || f.value > 100000) continue;
    const tail = CURRENCY_AFTER.exec(text.slice(f.end))?.[0].length || 0;
    signals.push({ type: 'budget', value: Math.round(f.value), words: text.slice(f.start, f.end + tail).trim() });
    m.hide(f.start, f.end + tail);
  }
  return m.text;
}

// ---------- phrase scan ----------

function scanPhrases(tokens, lookup) {
  const found = [];
  const fresh = () => ({ mode: 'default', negated: false, consumed: false, goal: false, current: false });
  let state = fresh();
  let clause = 0;
  for (let i = 0; i < tokens.length; ) {
    const tok = tokens[i];
    if (tok.punct) {
      // A negated list joined by "ni" / "nor" / "or" keeps its negation across commas: "no AWS, Azure ni Google".
      const carry = tok.raw === ',' && state.negated && listGoesOn(tokens, i + 1, lookup);
      state = { ...fresh(), negated: carry };
      clause++;
      i++;
      continue;
    }
    let hit = null;
    for (let len = Math.min(MAX_LEN, tokens.length - i); len > 0 && !hit; len--) {
      const seq = tokens.slice(i, i + len);
      if (seq.some((t) => t.punct)) continue;
      const entry = lookup(seq.map((t) => t.key).join(' '));
      if (entry) hit = { entry, len, words: seq.map((t) => t.raw).join(' ') };
    }
    if (!hit) {
      i++;
      continue;
    }
    const e = hit.entry;
    if (e.cue === 'want') {
      if (state.consumed) state.negated = false; // "no AWS and I want security"; "don't want to learn AWS" stays negative
      state.mode = 'want';
      state.goal = true;
      state.current = false;
    } else if (e.cue === 'known') {
      if (!(e.weak && state.goal)) {
        state.mode = 'known';
        state.goal = false;
      }
    } else if (e.cue === 'neg') {
      state.negated = true;
      state.consumed = false;
    } else if (e.cue === 'reset') {
      state = fresh();
    } else if (e.cue === 'current') {
      if (state.consumed) state.negated = false;
      state.mode = 'default';
      state.goal = false;
      state.current = true;
    } else if (!e.cue) {
      found.push({ entry: e, words: hit.words, i, j: i + hit.len, clause, negated: state.negated, mode: state.mode, goal: state.goal, current: state.current });
      if (state.negated) state.consumed = true;
    }
    i += hit.len;
  }
  return found;
}

function listGoesOn(tokens, from, lookup) {
  for (let i = from; i < tokens.length && !tokens[i].punct; i++) {
    const e = lookup(tokens[i].key);
    if (e && e.cue && e.cue !== 'neg') return false;
    if (['ni', 'nor', 'or', 'o'].includes(tokens[i].raw)) return true;
  }
  return false;
}

// ---------- signals ----------

const ORDER = ['role', 'level', 'cert', 'want', 'area', 'provider', 'known', 'has', 'avoid-cert', 'avoid-skill', 'avoid-area', 'avoid-provider', 'budget', 'hours', 'weeks', 'style', 'practice'];

/** A stable key for a signal, used to remove it from the interface. */
export const signalKey = (s) => `${s.type}:${s.value}`;

function toSignals(found, numeric, providerNames) {
  // A certification code: "like AZ-900", "ya tengo la CLF-C02", "not the CISSP".
  const out = [...numeric];
  const push = (type, value, words, extra = {}) => out.push({ type, value, words, ...extra });
  // Next to each other in the same clause, with at most one word between: "Python developer", "senior DevOps".
  const near = (f, g) => f.clause === g.clause && ((g.i >= f.j && g.i - f.j <= 1) || (f.i >= g.j && f.i - g.j <= 1));
  const roleSpans = found.filter((f) => f.entry.roles && !f.negated);
  const levelSpans = found.filter((f) => f.entry.level && !f.negated);
  const nextToRole = (f) => roleSpans.some((r) => near(f, r));

  for (const f of found) {
    const e = f.entry;
    const w = f.words;
    if (e.level) {
      if (!f.negated) push('level', e.level, w);
      else if (e.level !== 'some') push('level', 'some', w); // "not a beginner", "no soy experto"
    }
    if ('budget' in e && !f.negated) push('budget', e.budget, w);
    if ((e.cheap && !f.negated) || (e.expensive && f.negated)) push('budget', CHEAP_USD, w, { soft: true });
    if (e.anyBudget && !f.negated) push('budget', null, w);
    if (e.practice && !f.negated) push('practice', true, w);
    if (e.style) push('style', f.negated ? (e.style === 'practical' ? 'knowledge' : 'practical') : e.style, w);
    if ('weeks' in e && !f.negated) push('weeks', e.weeks, w);
    if (e.roles && !f.negated) {
      for (const r of e.roles) push('role', r, w);
      if (f.goal && e.implies) {
        for (const s of e.implies.skills || []) push('want', s, w);
        for (const a of e.implies.areas || []) push('area', a, w);
      }
    }
    if (e.cert) {
      const c = e.cert;
      const extra = { label: c.code, skills: c.skills, area: c.category };
      if (f.negated) push('avoid-cert', c.id, w, extra);
      else push(f.mode === 'known' ? 'has' : 'cert', c.id, w, extra);
      continue;
    }
    if (e.asRole && !f.negated && !f.goal && (f.current || levelSpans.some((l) => near(f, l)))) {
      push('role', e.asRole, w); // "soy DevOps", "senior DevOps": a role, not a topic
      continue;
    }
    if (e.skills || e.areas || e.provider) {
      const provider = e.provider && resolveProvider(e.provider, providerNames);
      if (f.negated) {
        // "I don't use AWS" says nothing about what to learn; "not the CKA" (not in the catalog) is not "no Kubernetes".
        if (f.mode === 'known' || e.code) continue;
        for (const s of e.skills || []) push('avoid-skill', s, w);
        if (e.generic || !e.skills) for (const a of e.areas || []) push('avoid-area', a, w);
        if (provider) push('avoid-provider', provider, w);
      } else if (f.mode === 'known' || (!f.goal && nextToRole(f))) {
        for (const s of e.skills || []) push('known', s, w); // "I use AWS", "Python developer"
      } else {
        for (const s of e.skills || []) push('want', s, w);
        for (const a of e.areas || []) push('area', a, w);
        if (provider) push('provider', provider, w, e.restricted ? { restricted: true } : {});
      }
    }
  }
  return settle(out);
}

function resolveProvider(name, providerNames) {
  if (!providerNames) return name;
  const key = normalize(name);
  return providerNames.find((p) => normalize(p) === key) || null;
}

// One value per single-valued kind, no duplicates, and "leave out" beats "want".
function settle(signals) {
  const one = (type, pick) => {
    const all = signals.filter((s) => s.type === type);
    if (!all.length) return [];
    const value = pick(all.map((s) => s.value));
    const base = all.find((s) => s.value === value && !s.soft) || all.find((s) => s.value === value) || {};
    return [{ ...base, type, value, words: [...new Set(all.map((s) => s.words))].join(', ') }];
  };
  const levels = one('level', (v) => (v.includes('new') && v.includes('experienced') ? 'some' : v.find((x) => x !== 'some') || 'some'));
  // An amount beats "cheap" and "free" ("free or under $100" means up to 100); a stated amount beats "any price".
  const budgets = one('budget', (v) => {
    const hard = signals.filter((s) => s.type === 'budget' && s.value != null && !s.soft).map((s) => s.value);
    const paid = hard.filter((x) => x > 0);
    if (paid.length) return Math.min(...paid);
    if (hard.length) return 0;
    if (v.includes(CHEAP_USD) && signals.some((s) => s.type === 'budget' && s.soft)) return CHEAP_USD;
    return null;
  });
  const firstOf = (type) => one(type, (v) => v[0]);
  const lastOf = (type) => one(type, (v) => v.at(-1));
  const singles = [...levels, ...budgets, ...firstOf('hours'), ...firstOf('weeks'), ...lastOf('style'), ...firstOf('practice')];
  const avoided = new Set(signals.filter((s) => s.type.startsWith('avoid-')).map((s) => `${s.type.slice(6)}:${s.value}`));
  const opposite = { want: 'skill', known: 'skill', area: 'area', provider: 'provider', cert: 'cert', has: 'cert' };
  const seen = new Set();
  const multi = [];
  for (const s of signals) {
    if (['level', 'budget', 'hours', 'weeks', 'style', 'practice'].includes(s.type)) continue;
    if (s.type !== 'known' && opposite[s.type] && avoided.has(`${opposite[s.type]}:${s.value}`)) continue;
    const k = signalKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    multi.push(s);
  }
  return [...multi, ...singles].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
}

// Codes worth matching: four characters or more with a letter ("AZ-900", "1Z0-1157", "CKAD", "CISSP"),
// and a digit when there are several words ("Agent databases" is a name, not a code). Shorter ones
// ("CC", "ACE", "PCA") and words people use anyway would match ordinary text.
const NOT_CODES = new Set(['papa']);
function codeKeys(code) {
  const keys = [];
  for (const part of String(code).split(/[/()]/)) {
    const k = keyOf(part.replace(/\+/g, ''));
    if (!k || k.split(' ').length > 3) continue;
    const compact = k.replace(/ /g, '');
    if (compact.length < 4 || !/[a-z]/.test(compact) || NOT_CODES.has(compact)) continue;
    if (k.includes(' ') && !/\d/.test(k)) continue;
    keys.push(k);
    const segs = k.split(' ');
    if (segs.length === 3 && /\d/.test(segs[1])) keys.push(segs.slice(0, 2).join(' ')); // "1Z0-1157-26" → "1Z0-1157"
    if (segs.length > 1) keys.push(compact); // "AZ900"
  }
  return keys;
}

const catalogIndex = new WeakMap();
function indexCatalog(certs) {
  if (!certs) return { extra: new Map(), providers: null };
  if (catalogIndex.has(certs)) return catalogIndex.get(certs);
  const extra = new Map();
  const providers = [...new Set(certs.map((c) => c.provider))];
  for (const name of providers) {
    const k = keyOf(name);
    if (k && !LEXICON.has(k)) extra.set(k, { provider: name });
  }
  for (const c of certs) for (const k of codeKeys(c.code)) if (!extra.has(k)) extra.set(k, { cert: { id: c.id, code: c.code, skills: c.skills, category: c.category } });
  const index = { extra, providers };
  catalogIndex.set(certs, index);
  return index;
}

/**
 * Read a goal. With `certs` (the catalog) issuer signals are limited to issuers that exist, the
 * catalog's own issuer names are recognized ("Hack The Box") and so are certification codes.
 */
export function parseIntent(text, { certs = null } = {}) {
  const norm = normalize(text);
  const numeric = [];
  const rest = scanNumbers(norm, numeric);
  const { extra, providers } = indexCatalog(certs);
  const longest = Math.max(MAX_LEN, ...[...extra.keys()].map((k) => k.split(' ').length));
  // Codes go first: "CKAD" is a certification here, not only Kubernetes from the Linux Foundation.
  const lookup = (k) => (k.split(' ').length > longest ? null : (extra.get(k)?.cert && extra.get(k)) || LEXICON.get(k) || extra.get(k));
  const found = scanPhrases(tokenize(rest), lookup);
  return intentFrom(toSignals(found, numeric, providers), text);
}

/** Build the intent (profile and extras) from signals. Removing a chip is intentFrom(signals without it). */
export function intentFrom(signals, text = '') {
  const of = (type) => signals.filter((s) => s.type === type).map((s) => s.value);
  const single = (type) => signals.find((s) => s.type === type);
  const avoid = { skills: of('avoid-skill'), areas: of('avoid-area'), providers: of('avoid-provider'), certs: [...of('avoid-cert'), ...of('has')] };
  const budget = single('budget');
  const providers = of('provider');
  const like = signals.filter((s) => s.type === 'cert');
  const has = signals.filter((s) => s.type === 'has');
  const uniq = (list) => [...new Set(list)];
  const profile = {
    roles: of('role'),
    known: uniq([...of('known'), ...has.flatMap((s) => s.skills || [])]),
    want: uniq([...of('want'), ...like.flatMap((s) => s.skills || [])]).filter((x) => !avoid.skills.includes(x)),
    experience: single('level')?.value || 'some',
    budget: budget ? budget.value : null,
    includeRestricted: signals.some((s) => s.type === 'provider' && s.restricted),
    style: single('style')?.value || 'any',
  };
  const areas = uniq([...of('area'), ...like.map((s) => s.area).filter(Boolean)]).filter((a) => !avoid.areas.includes(a));
  const topical = profile.roles.length + profile.known.length + profile.want.length + areas.length + providers.length;
  return {
    text,
    signals,
    profile,
    areas,
    named: of('cert'),
    providers,
    avoid,
    practice: Boolean(single('practice')),
    hoursPerWeek: single('hours')?.value ?? null,
    weeks: single('weeks')?.value ?? null,
    levelStated: Boolean(single('level')),
    topical,
  };
}

/** The same intent without one signal (a removed chip). */
export function withoutSignal(intent, key) {
  return intentFrom(
    intent.signals.filter((s) => signalKey(s) !== key),
    intent.text,
  );
}

// ---------- recommendations ----------

// `switching` gives back what the "For me" score takes for a role mismatch (its role weight) when a
// certification is in the area you want to move into: "soy dev, quiero meterme en ciberseguridad"
// is about security roles, not about the developer role you have now.
const BONUS = { named: 15, provider: 12, area: 8, areaOnly: 15, practice: 6, switching: 20 };
// Picks scoring under this share of the best one are left to the full list.
const FLOOR = 0.55;
const PENALTY = { avoided: 25, upcoming: 5, late: 10 };

/**
 * Turn ranked results (lib/match.js `rank` with intent.profile) into a short list of picks.
 * On top of the "For me" score it leaves out issuers and areas the text ruled out, lowers skills it
 * ruled out, nudges named issuers, areas and practice sets up, and checks study time against the
 * hours and deadline given. Picks need at least one link to what was asked for.
 * `estimate(cert)` returns planning hours (lib/planner.js estimateHours). Returns { picks, more, left }:
 * `more` related ones did not make the cut, `left` were ruled out (budget, eligibility, what you skipped).
 */
export function recommend(certs, ranked, intent, { limit = 5, labels = {}, estimate = null } = {}) {
  const label = (x) => labels[x] || x;
  const byId = new Map(certs.map((c) => [c.id, c]));
  const p = intent.profile;
  const want = new Set(p.want);
  const roles = new Set(p.roles);
  const known = new Set(p.known);
  const areas = new Set(intent.areas);
  const prefer = new Set(intent.providers);
  const named = new Set(intent.named || []);
  const { avoid } = intent;
  const interest = want.size + areas.size + prefer.size + named.size > 0;

  const picks = [];
  let left = 0;
  for (const r of ranked) {
    const c = byId.get(r.id);
    if (!c) continue;
    const wantHits = c.skills.filter((s) => want.has(s));
    // Linked to what was asked for: a wanted skill, a named area, issuer or code; failing those, the
    // role; failing that, what you already use. With nothing topical said, everything is in.
    let relevant = true;
    if (interest) relevant = named.has(c.id) || wantHits.length > 0 || areas.has(c.category) || prefer.has(c.provider);
    else if (roles.size) relevant = c.roles.some((x) => roles.has(x));
    else if (known.size) relevant = c.skills.some((s) => known.has(s));
    if (!relevant) continue;
    let excluded = r.excluded;
    // "Free" means known to be free: a price that varies by region might not be.
    if (!excluded && p.budget === 0 && c.fee.usd == null) excluded = 'No single USD price published';
    if (!excluded && (avoid.certs || []).includes(c.id)) excluded = 'You asked to leave it out or already have it';
    if (!excluded && avoid.providers.includes(c.provider)) excluded = `You asked to leave out ${c.provider}`;
    if (!excluded && avoid.areas.includes(c.category)) excluded = `You asked to leave out ${label(c.category)}`;
    if (excluded) {
      left++;
      continue;
    }

    let score = r.score;
    const reasons = [...r.reasons];
    const warnings = [...r.warnings];
    const notes = [];
    if (named.has(c.id)) {
      score += BONUS.named;
      reasons.unshift('The one you mentioned');
    }
    if (prefer.has(c.provider)) {
      score += BONUS.provider;
      reasons.unshift(`From ${c.provider}, as you asked`);
    }
    if (areas.has(c.category)) {
      score += want.size ? BONUS.area : BONUS.areaOnly;
      reasons.push(`In ${label(c.category)}, an area you named`);
      if (wantHits.length && roles.size && !c.roles.some((x) => roles.has(x))) score += BONUS.switching;
    }
    if (intent.practice && c.practice_questions) {
      score += BONUS.practice;
      reasons.push(`Has ${c.practice_questions} practice questions in pathfinder`);
    }
    const skipped = c.skills.filter((s) => avoid.skills.includes(s));
    if (skipped.length) {
      score -= PENALTY.avoided;
      warnings.unshift(`Includes ${skipped.map(label).join(', ')}, which you wanted to skip`);
    }
    if (c.status === 'upcoming') score -= PENALTY.upcoming;
    if (estimate && (intent.hoursPerWeek || intent.weeks)) {
      const hours = estimate(c);
      const perWeek = intent.hoursPerWeek;
      const span = intent.weeks === 1 ? '1 week' : `${intent.weeks} weeks`;
      if (perWeek) {
        const weeks = Math.max(1, Math.ceil(hours / perWeek));
        if (intent.weeks && weeks > intent.weeks) {
          score -= PENALTY.late;
          warnings.push(`About ${hours} h of study: more than ${span} at ${perWeek} h a week`);
        } else notes.push(weeks === 1 ? `About a week at ${perWeek} h a week (${hours} h)` : `About ${weeks} weeks at ${perWeek} h a week (${hours} h)`);
      } else {
        notes.push(`About ${Math.ceil(hours / intent.weeks)} h a week to be ready in ${span} (${hours} h)`);
      }
    }
    picks.push({ id: c.id, cert: c, score: Math.max(0, Math.min(100, Math.round(score))), reasons, warnings, notes });
  }
  const fee = (c) => (c.fee.usd == null ? Infinity : c.fee.usd);
  picks.sort((a, b) => b.score - a.score || fee(a.cert) - fee(b.cert) || a.id.localeCompare(b.id));
  const floor = picks.length ? picks[0].score * FLOOR : 0;
  const shown = picks.filter((x) => x.score >= floor).slice(0, limit);
  return { picks: shown, more: picks.length - shown.length, left };
}
