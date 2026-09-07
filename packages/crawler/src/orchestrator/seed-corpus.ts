/**
 * @opensearch/crawler — Curated Seed Corpus Definitions (Phase 23)
 *
 * Provides a structured, categorised, high-quality collection of seed URLs
 * representing useful public web domains, technical documentation, open source,
 * reference resources, and knowledge repositories suitable for V1.0.0.
 */

export interface SeedCategory {
  id: string;
  name: string;
  description: string;
  seeds: SeedEntry[];
}

export interface SeedEntry {
  url: string;
  title: string;
  description: string;
  priority: number;
  tags: string[];
}

export const CURATED_SEED_CORPUS: SeedCategory[] = [
  {
    id: 'tech-docs',
    name: 'Technical Documentation & Standards',
    description: 'Core web specifications, MDN web docs, TypeScript, and open source guides.',
    seeds: [
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
        title: 'MDN HTTP Documentation',
        description: 'Comprehensive guides on HTTP protocols, status codes, headers, and caching.',
        priority: 1,
        tags: ['web', 'http', 'standards', 'docs'],
      },
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        title: 'MDN JavaScript Reference',
        description: 'Standard documentation for ECMAScript, JavaScript syntax, and Web APIs.',
        priority: 1,
        tags: ['javascript', 'programming', 'docs'],
      },
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/CSS',
        title: 'MDN CSS Reference',
        description: 'Complete CSS reference for styling, layout, animations, and responsive web design.',
        priority: 1,
        tags: ['css', 'web', 'design', 'frontend'],
      },
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTML',
        title: 'MDN HTML Reference',
        description: 'HTML5 elements, attributes, semantic markup, and accessibility documentation.',
        priority: 1,
        tags: ['html', 'web', 'markup', 'frontend'],
      },
      {
        url: 'https://www.typescriptlang.org/docs/',
        title: 'TypeScript Official Documentation',
        description: 'Handbook and reference for typed JavaScript and TypeScript compiler.',
        priority: 2,
        tags: ['typescript', 'programming', 'compiler'],
      },
      {
        url: 'https://nodejs.org/en/docs',
        title: 'Node.js Documentation',
        description: 'Server-side JavaScript runtime documentation, standard libraries, and APIs.',
        priority: 2,
        tags: ['nodejs', 'javascript', 'backend'],
      },
      {
        url: 'https://docs.python.org/3/',
        title: 'Python 3 Documentation',
        description: 'Official Python 3 documentation including tutorials, library reference, and language specification.',
        priority: 1,
        tags: ['python', 'programming', 'docs', 'scripting'],
      },
      {
        url: 'https://www.rust-lang.org/learn',
        title: 'Rust Programming Language',
        description: 'Rust language learning resources, the official Rust book, and documentation.',
        priority: 2,
        tags: ['rust', 'programming', 'systems', 'memory-safe'],
      },
      {
        url: 'https://go.dev/doc/',
        title: 'Go Programming Language Documentation',
        description: 'Official Go language documentation, tutorials, and standard library reference.',
        priority: 2,
        tags: ['go', 'golang', 'programming', 'backend'],
      },
      {
        url: 'https://www.w3.org/',
        title: 'W3C Web Standards',
        description: 'World Wide Web Consortium web standards, specifications, and guidelines.',
        priority: 2,
        tags: ['standards', 'web', 'specifications', 'html', 'css'],
      },
      {
        url: 'https://git-scm.com/doc',
        title: 'Git Documentation',
        description: 'Official Git version control documentation, branching, merging, and workflow guides.',
        priority: 2,
        tags: ['git', 'version-control', 'devtools'],
      },
      {
        url: 'https://docs.docker.com/',
        title: 'Docker Documentation',
        description: 'Docker container platform documentation, compose files, and deployment guides.',
        priority: 2,
        tags: ['docker', 'containers', 'devops'],
      },
      {
        url: 'https://kubernetes.io/docs/home/',
        title: 'Kubernetes Documentation',
        description: 'Container orchestration, Kubernetes cluster management, and deployment documentation.',
        priority: 2,
        tags: ['kubernetes', 'containers', 'devops', 'cloud'],
      },
      {
        url: 'https://www.linux.org/',
        title: 'Linux Operating System',
        description: 'Linux open source operating system, distributions, kernel, and community resources.',
        priority: 2,
        tags: ['linux', 'os', 'open-source', 'unix'],
      },
    ],
  },
  {
    id: 'open-knowledge',
    name: 'Open Knowledge & Reference',
    description: 'Free public knowledge repositories, encyclopedias, and archives.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Search_engine',
        title: 'Wikipedia — Search Engine',
        description: 'Information retrieval, web crawlers, inverted indices, and search engine history.',
        priority: 1,
        tags: ['search', 'information-retrieval', 'encyclopedia'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Inverted_index',
        title: 'Wikipedia — Inverted Index',
        description: 'Data structure explanation for term dictionaries and document postings lists.',
        priority: 1,
        tags: ['indexer', 'algorithms', 'computer-science'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Okapi_BM25',
        title: 'Wikipedia — Okapi BM25',
        description: 'Probabilistic relevance ranking function used in information retrieval systems.',
        priority: 1,
        tags: ['ranking', 'bm25', 'math', 'search'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Artificial_intelligence',
        title: 'Wikipedia — Artificial Intelligence',
        description: 'Overview of artificial intelligence, machine learning, neural networks, and deep learning.',
        priority: 1,
        tags: ['ai', 'machine-learning', 'technology', 'neural'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Machine_learning',
        title: 'Wikipedia — Machine Learning',
        description: 'Machine learning algorithms, supervised learning, unsupervised learning, and deep learning.',
        priority: 1,
        tags: ['ml', 'ai', 'algorithms', 'data-science'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Python_(programming_language)',
        title: 'Wikipedia — Python Programming Language',
        description: 'Python programming language history, features, scientific computing, and use cases.',
        priority: 1,
        tags: ['python', 'programming', 'encyclopedia'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/World_Wide_Web',
        title: 'Wikipedia — World Wide Web',
        description: 'History and technology of the World Wide Web, HTTP protocol, and web browsers.',
        priority: 1,
        tags: ['web', 'internet', 'history', 'www'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Climate_change',
        title: 'Wikipedia — Climate Change',
        description: 'Causes, effects, and solutions to global climate change and global warming.',
        priority: 1,
        tags: ['climate', 'environment', 'science', 'global'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Space_exploration',
        title: 'Wikipedia — Space Exploration',
        description: 'Human and robotic space exploration, rockets, satellites, Mars missions, and NASA.',
        priority: 1,
        tags: ['space', 'nasa', 'science', 'rockets', 'mars'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Quantum_computing',
        title: 'Wikipedia — Quantum Computing',
        description: 'Quantum computers, qubits, quantum entanglement, algorithms, and future applications.',
        priority: 2,
        tags: ['quantum', 'computing', 'physics', 'technology'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Blockchain',
        title: 'Wikipedia — Blockchain',
        description: 'Distributed ledger technology, cryptocurrency, smart contracts, and decentralized applications.',
        priority: 2,
        tags: ['blockchain', 'crypto', 'technology', 'bitcoin'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Open_source',
        title: 'Wikipedia — Open Source',
        description: 'Open source software movement, licenses, community development, and free software.',
        priority: 2,
        tags: ['open-source', 'software', 'community'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Internet',
        title: 'Wikipedia — Internet',
        description: 'Global network of networks, TCP/IP, internet protocols, and history.',
        priority: 1,
        tags: ['internet', 'networking', 'history', 'protocol'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Cybersecurity',
        title: 'Wikipedia — Cybersecurity',
        description: 'Computer security, hacking, cyber threats, vulnerabilities, and protection methods.',
        priority: 1,
        tags: ['security', 'hacking', 'privacy', 'cyber'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Database',
        title: 'Wikipedia — Database',
        description: 'Relational databases, SQL, NoSQL, database design and management systems.',
        priority: 1,
        tags: ['database', 'sql', 'nosql', 'storage', 'data'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Algorithm',
        title: 'Wikipedia — Algorithm',
        description: 'Definition, types, sorting, searching, and complexity analysis of algorithms.',
        priority: 1,
        tags: ['algorithms', 'computer-science', 'programming'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Data_structure',
        title: 'Wikipedia — Data Structures',
        description: 'Arrays, linked lists, trees, graphs, stacks, queues, and hash maps explained.',
        priority: 1,
        tags: ['data-structures', 'programming', 'computer-science'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Cryptocurrency',
        title: 'Wikipedia — Cryptocurrency',
        description: 'Digital currencies, Bitcoin, Ethereum, decentralized finance, and crypto markets.',
        priority: 2,
        tags: ['crypto', 'bitcoin', 'finance', 'blockchain', 'ethereum'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Deep_learning',
        title: 'Wikipedia — Deep Learning',
        description: 'Neural networks with multiple layers, convolutional networks, and AI applications.',
        priority: 1,
        tags: ['deep-learning', 'ai', 'neural', 'machine-learning'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Natural_language_processing',
        title: 'Wikipedia — Natural Language Processing',
        description: 'NLP, computational linguistics, text analysis, chatbots, and language models.',
        priority: 1,
        tags: ['nlp', 'ai', 'language', 'text', 'chatbot'],
      },
    ],
  },
  {
    id: 'privacy-security',
    name: 'Privacy, Security & Open Web',
    description: 'Foundational organizations advocating for privacy, open source, and security.',
    seeds: [
      {
        url: 'https://www.eff.org/about',
        title: 'Electronic Frontier Foundation (EFF)',
        description: 'Defending digital privacy, free expression, surveillance resistance, and innovation online.',
        priority: 2,
        tags: ['privacy', 'civil-liberties', 'open-web', 'surveillance'],
      },
      {
        url: 'https://owasp.org/www-project-top-ten/',
        title: 'OWASP Top 10 Security Risks',
        description: 'Standard security awareness document for developers and web application security risks.',
        priority: 2,
        tags: ['security', 'owasp', 'appsec', 'web', 'vulnerability'],
      },
      {
        url: 'https://www.privacytools.io/',
        title: 'Privacy Tools',
        description: 'Privacy-focused tools, VPNs, browsers, and services to protect your online privacy.',
        priority: 2,
        tags: ['privacy', 'tools', 'security', 'vpn', 'anonymity'],
      },
    ],
  },
  {
    id: 'science-research',
    name: 'Science & Research',
    description: 'Scientific institutions, research papers, and knowledge resources.',
    seeds: [
      {
        url: 'https://www.nasa.gov/',
        title: 'NASA — National Aeronautics and Space Administration',
        description: 'Space exploration, Mars missions, Hubble, James Webb telescope, and earth science from NASA.',
        priority: 1,
        tags: ['space', 'nasa', 'astronomy', 'science', 'mars'],
      },
      {
        url: 'https://arxiv.org/',
        title: 'arXiv — Open Access Research Papers',
        description: 'Open access preprints in physics, mathematics, computer science, quantitative biology, and economics.',
        priority: 1,
        tags: ['research', 'papers', 'academia', 'science', 'preprint'],
      },
      {
        url: 'https://www.who.int/',
        title: 'World Health Organization (WHO)',
        description: 'Global health information, disease outbreaks, vaccines, and public health guidelines.',
        priority: 1,
        tags: ['health', 'medicine', 'who', 'global', 'disease'],
      },
      {
        url: 'https://www.cdc.gov/',
        title: 'CDC — Centers for Disease Control and Prevention',
        description: 'Disease prevention, public health, vaccines, cancer, diabetes, and health statistics.',
        priority: 1,
        tags: ['health', 'cdc', 'disease', 'prevention', 'vaccines'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Physics',
        title: 'Wikipedia — Physics',
        description: 'The science of matter, energy, motion, gravity, and fundamental forces of the universe.',
        priority: 2,
        tags: ['physics', 'science', 'quantum', 'energy', 'mechanics'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Mathematics',
        title: 'Wikipedia — Mathematics',
        description: 'Study of numbers, calculus, algebra, geometry, statistics, and mathematical proofs.',
        priority: 2,
        tags: ['math', 'mathematics', 'science', 'calculus', 'algebra'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Chemistry',
        title: 'Wikipedia — Chemistry',
        description: 'Science of matter, chemical reactions, atoms, molecules, periodic table, and organic chemistry.',
        priority: 2,
        tags: ['chemistry', 'science', 'elements', 'molecules', 'organic'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Biology',
        title: 'Wikipedia — Biology',
        description: 'Study of life, evolution, genetics, DNA, cells, ecosystems, and living organisms.',
        priority: 2,
        tags: ['biology', 'science', 'life', 'evolution', 'genetics', 'dna'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Genetics',
        title: 'Wikipedia — Genetics',
        description: 'DNA, genes, heredity, genetic engineering, CRISPR, and genomics research.',
        priority: 2,
        tags: ['genetics', 'dna', 'biology', 'crispr', 'genome'],
      },
    ],
  },
  {
    id: 'news-media',
    name: 'News & Technology Media',
    description: 'Reputable news sources, technology media, and global reporting.',
    seeds: [
      {
        url: 'https://www.bbc.com/news',
        title: 'BBC News',
        description: 'Breaking news, world news, politics, science, and UK news from BBC News.',
        priority: 1,
        tags: ['news', 'bbc', 'world', 'media', 'politics'],
      },
      {
        url: 'https://www.reuters.com/',
        title: 'Reuters News Agency',
        description: 'International breaking news, business, finance, markets, and world reports from Reuters.',
        priority: 1,
        tags: ['news', 'reuters', 'business', 'finance', 'international'],
      },
      {
        url: 'https://techcrunch.com/',
        title: 'TechCrunch',
        description: 'Technology news, startup funding, gadgets, apps, AI, and innovation stories.',
        priority: 1,
        tags: ['tech', 'startups', 'news', 'innovation', 'ai'],
      },
      {
        url: 'https://arstechnica.com/',
        title: 'Ars Technica',
        description: 'In-depth technology, science, gaming, and culture reporting and analysis.',
        priority: 2,
        tags: ['tech', 'science', 'gaming', 'news'],
      },
      {
        url: 'https://www.wired.com/',
        title: 'WIRED Magazine',
        description: 'Technology, science, culture, artificial intelligence, and business news from WIRED.',
        priority: 2,
        tags: ['technology', 'culture', 'science', 'business', 'ai'],
      },
    ],
  },
  {
    id: 'programming-learning',
    name: 'Programming & Learning',
    description: 'Educational resources for programming, computer science, and development.',
    seeds: [
      {
        url: 'https://stackoverflow.com/',
        title: 'Stack Overflow',
        description: 'Questions and answers for programmers covering all languages and frameworks.',
        priority: 1,
        tags: ['programming', 'qa', 'community', 'code', 'debugging'],
      },
      {
        url: 'https://www.freecodecamp.org/',
        title: 'freeCodeCamp',
        description: 'Free interactive coding education with certifications in web development and data science.',
        priority: 1,
        tags: ['learning', 'coding', 'free', 'education', 'web'],
      },
      {
        url: 'https://www.khanacademy.org/',
        title: 'Khan Academy',
        description: 'Free educational content in math, science, programming, history, and economics.',
        priority: 1,
        tags: ['education', 'free', 'math', 'science', 'history'],
      },
    ],
  },
  {
    id: 'health-lifestyle',
    name: 'Health & Lifestyle',
    description: 'Health information, medicine, wellness, and lifestyle resources.',
    seeds: [
      {
        url: 'https://www.webmd.com/',
        title: 'WebMD Health Information',
        description: 'Medical conditions, symptoms, treatments, drugs, diet, and health news.',
        priority: 1,
        tags: ['health', 'medicine', 'symptoms', 'wellness', 'drugs'],
      },
      {
        url: 'https://www.mayoclinic.org/',
        title: 'Mayo Clinic',
        description: 'Expert physician-reviewed health information, diseases, symptoms, and treatment guides.',
        priority: 1,
        tags: ['health', 'medical', 'clinic', 'disease', 'treatment'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Nutrition',
        title: 'Wikipedia — Nutrition',
        description: 'Science of nutrition, dietary requirements, macros, vitamins, minerals, and food health.',
        priority: 2,
        tags: ['nutrition', 'health', 'food', 'diet', 'vitamins'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Mental_health',
        title: 'Wikipedia — Mental Health',
        description: 'Mental health, psychological wellbeing, depression, anxiety, and treatments.',
        priority: 2,
        tags: ['mental-health', 'psychology', 'wellness', 'anxiety'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Vaccine',
        title: 'Wikipedia — Vaccines',
        description: 'Vaccination, immunization, how vaccines work, and vaccine history.',
        priority: 2,
        tags: ['vaccine', 'health', 'immunization', 'medicine'],
      },
    ],
  },
  {
    id: 'business-economics',
    name: 'Business & Economics',
    description: 'Business, economics, entrepreneurship, and financial information resources.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Economics',
        title: 'Wikipedia — Economics',
        description: 'Study of production, distribution, markets, and consumption of goods and services.',
        priority: 1,
        tags: ['economics', 'business', 'finance', 'trade', 'market'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Entrepreneurship',
        title: 'Wikipedia — Entrepreneurship',
        description: 'Starting businesses, innovation, startups, venture capital, and business creation.',
        priority: 2,
        tags: ['startup', 'business', 'entrepreneurship', 'innovation'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/E-commerce',
        title: 'Wikipedia — E-commerce',
        description: 'Electronic commerce, online shopping, digital payments, and marketplaces.',
        priority: 2,
        tags: ['ecommerce', 'business', 'shopping', 'online', 'marketplace'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Supply_chain',
        title: 'Wikipedia — Supply Chain',
        description: 'Supply chain management, logistics, manufacturing, and global trade networks.',
        priority: 2,
        tags: ['supply-chain', 'logistics', 'business', 'manufacturing'],
      },
    ],
  },
  {
    id: 'history-geography',
    name: 'History & Geography',
    description: 'World history, geography, and cultural heritage resources.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/History_of_the_world',
        title: 'Wikipedia — History of the World',
        description: 'Comprehensive overview of world history from ancient civilizations to modern times.',
        priority: 1,
        tags: ['history', 'world', 'ancient', 'civilizations'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/World_War_II',
        title: 'Wikipedia — World War II',
        description: 'Global conflict from 1939 to 1945 involving most of the world nations and major powers.',
        priority: 1,
        tags: ['history', 'war', 'wwii', 'world', 'conflict'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/United_States',
        title: 'Wikipedia — United States',
        description: 'Overview of the United States, its history, geography, culture, and government.',
        priority: 1,
        tags: ['usa', 'america', 'geography', 'history', 'government'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/India',
        title: 'Wikipedia — India',
        description: 'Overview of India, its ancient history, culture, technology, economy, and democracy.',
        priority: 1,
        tags: ['india', 'asia', 'geography', 'culture', 'technology'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/China',
        title: 'Wikipedia — China',
        description: 'Overview of China, ancient history, culture, economy, and global influence.',
        priority: 1,
        tags: ['china', 'asia', 'geography', 'history', 'economy'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Europe',
        title: 'Wikipedia — Europe',
        description: 'European continent, countries, culture, history, geography, and European Union.',
        priority: 2,
        tags: ['europe', 'geography', 'history', 'culture', 'eu'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Africa',
        title: 'Wikipedia — Africa',
        description: 'African continent, countries, culture, natural resources, and history.',
        priority: 2,
        tags: ['africa', 'geography', 'history', 'culture'],
      },
    ],
  },
  {
    id: 'culture-entertainment',
    name: 'Culture & Entertainment',
    description: 'Movies, music, literature, games, social media, and arts resources.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Video_game',
        title: 'Wikipedia — Video Games',
        description: 'History and overview of video games, gaming platforms, consoles, and the gaming industry.',
        priority: 2,
        tags: ['gaming', 'videogames', 'entertainment', 'console'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Music',
        title: 'Wikipedia — Music',
        description: 'Music theory, genres, history, instruments, and culture across the world.',
        priority: 2,
        tags: ['music', 'culture', 'arts', 'entertainment', 'genres'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Literature',
        title: 'Wikipedia — Literature',
        description: 'World literature, novels, poetry, plays, famous authors, and literary history.',
        priority: 2,
        tags: ['books', 'literature', 'reading', 'arts', 'novels'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Social_media',
        title: 'Wikipedia — Social Media',
        description: 'Social media platforms, user-generated content, digital communication, and influence.',
        priority: 2,
        tags: ['social-media', 'internet', 'communication', 'platforms'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Film',
        title: 'Wikipedia — Film and Cinema',
        description: 'History of cinema, film genres, directors, actors, and movie production.',
        priority: 2,
        tags: ['movies', 'cinema', 'film', 'entertainment'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Television',
        title: 'Wikipedia — Television',
        description: 'Television history, broadcasting, streaming, and popular TV shows and culture.',
        priority: 2,
        tags: ['tv', 'television', 'streaming', 'entertainment'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Sport',
        title: 'Wikipedia — Sports',
        description: 'Sports overview, major sports types, Olympics, FIFA, and global sporting events.',
        priority: 2,
        tags: ['sports', 'olympics', 'football', 'entertainment'],
      },
    ],
  },
  {
    id: 'environment',
    name: 'Environment & Sustainability',
    description: 'Environmental science, climate, renewable energy, and sustainability resources.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Renewable_energy',
        title: 'Wikipedia — Renewable Energy',
        description: 'Solar, wind, hydro, and other renewable energy sources for sustainable power.',
        priority: 1,
        tags: ['energy', 'solar', 'wind', 'sustainability', 'green'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Electric_vehicle',
        title: 'Wikipedia — Electric Vehicles',
        description: 'Electric cars, batteries, charging infrastructure, and the EV industry.',
        priority: 2,
        tags: ['electric-vehicle', 'ev', 'tesla', 'battery', 'green'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Deforestation',
        title: 'Wikipedia — Deforestation',
        description: 'Deforestation causes, effects on climate change, biodiversity loss, and solutions.',
        priority: 2,
        tags: ['environment', 'deforestation', 'forest', 'climate'],
      },
    ],
  },
];

/**
 * Returns a flat array of all curated seed URLs sorted by priority.
 */
export function getCuratedSeedUrls(): string[] {
  const allSeeds = CURATED_SEED_CORPUS.flatMap(cat => cat.seeds);
  return allSeeds
    .sort((a, b) => a.priority - b.priority)
    .map(s => s.url);
}

/**
 * Returns all seed entries across all categories.
 */
export function getAllCuratedSeeds(): SeedEntry[] {
  return CURATED_SEED_CORPUS.flatMap(cat => cat.seeds);
}
