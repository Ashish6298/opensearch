/**
 * @opensearch/crawler — Curated Seed Corpus Definitions (Phase 23)
 *
 * Provides a structured, categorised, high-quality collection of seed URLs
 * representing useful public web domains, technical documentation, open source,
 * reference resources, knowledge repositories, and everyday modern search queries.
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
        description:
          'Complete CSS reference for styling, layout, animations, and responsive web design.',
        priority: 1,
        tags: ['css', 'web', 'design', 'frontend'],
      },
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTML',
        title: 'MDN HTML Reference',
        description:
          'HTML5 elements, attributes, semantic markup, and accessibility documentation.',
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
        description:
          'Official Python 3 documentation including tutorials, library reference, and language specification.',
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
        description:
          'Official Go language documentation, tutorials, and standard library reference.',
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
        description:
          'Official Git version control documentation, branching, merging, and workflow guides.',
        priority: 2,
        tags: ['git', 'version-control', 'devtools'],
      },
      {
        url: 'https://docs.docker.com/',
        title: 'Docker Documentation',
        description:
          'Docker container platform documentation, compose files, and deployment guides.',
        priority: 2,
        tags: ['docker', 'containers', 'devops'],
      },
      {
        url: 'https://kubernetes.io/docs/home/',
        title: 'Kubernetes Documentation',
        description:
          'Container orchestration, Kubernetes cluster management, and deployment documentation.',
        priority: 2,
        tags: ['kubernetes', 'containers', 'devops', 'cloud'],
      },
      {
        url: 'https://www.linux.org/',
        title: 'Linux Operating System',
        description:
          'Linux open source operating system, distributions, kernel, and community resources.',
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
        description:
          'Information retrieval, web crawlers, inverted indices, and search engine history.',
        priority: 1,
        tags: ['search', 'information-retrieval', 'encyclopedia'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Inverted_index',
        title: 'Wikipedia — Inverted Index',
        description:
          'Data structure explanation for term dictionaries and document postings lists.',
        priority: 1,
        tags: ['indexer', 'algorithms', 'computer-science'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Okapi_BM25',
        title: 'Wikipedia — Okapi BM25',
        description:
          'Probabilistic relevance ranking function used in information retrieval systems.',
        priority: 1,
        tags: ['ranking', 'bm25', 'math', 'search'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Artificial_intelligence',
        title: 'Wikipedia — Artificial Intelligence',
        description:
          'Overview of artificial intelligence, machine learning, neural networks, and deep learning.',
        priority: 1,
        tags: ['ai', 'machine-learning', 'technology', 'neural'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Machine_learning',
        title: 'Wikipedia — Machine Learning',
        description:
          'Machine learning algorithms, supervised learning, unsupervised learning, and deep learning.',
        priority: 1,
        tags: ['ml', 'ai', 'algorithms', 'data-science'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Python_(programming_language)',
        title: 'Wikipedia — Python Programming Language',
        description:
          'Python programming language history, features, scientific computing, and use cases.',
        priority: 1,
        tags: ['python', 'programming', 'encyclopedia'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/World_Wide_Web',
        title: 'Wikipedia — World Wide Web',
        description:
          'History and technology of the World Wide Web, HTTP protocol, and web browsers.',
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
        description:
          'Human and robotic space exploration, rockets, satellites, Mars missions, and NASA.',
        priority: 1,
        tags: ['space', 'nasa', 'science', 'rockets', 'mars'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Quantum_computing',
        title: 'Wikipedia — Quantum Computing',
        description:
          'Quantum computers, qubits, quantum entanglement, algorithms, and future applications.',
        priority: 2,
        tags: ['quantum', 'computing', 'physics', 'technology'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Blockchain',
        title: 'Wikipedia — Blockchain',
        description:
          'Distributed ledger technology, cryptocurrency, smart contracts, and decentralized applications.',
        priority: 2,
        tags: ['blockchain', 'crypto', 'technology', 'bitcoin'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Open_source',
        title: 'Wikipedia — Open Source',
        description:
          'Open source software movement, licenses, community development, and free software.',
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
        description:
          'Computer security, hacking, cyber threats, vulnerabilities, and protection methods.',
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
        description:
          'Definition, types, sorting, searching, and complexity analysis of algorithms.',
        priority: 1,
        tags: ['algorithms', 'computer-science', 'programming'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Data_structure',
        title: 'Wikipedia — Data Structures',
        description:
          'Arrays, linked lists, trees, graphs, stacks, queues, and hash maps explained.',
        priority: 1,
        tags: ['data-structures', 'programming', 'computer-science'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Cryptocurrency',
        title: 'Wikipedia — Cryptocurrency',
        description:
          'Digital currencies, Bitcoin, Ethereum, decentralized finance, and crypto markets.',
        priority: 2,
        tags: ['crypto', 'bitcoin', 'finance', 'blockchain', 'ethereum'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Deep_learning',
        title: 'Wikipedia — Deep Learning',
        description:
          'Neural networks with multiple layers, convolutional networks, and AI applications.',
        priority: 1,
        tags: ['deep-learning', 'ai', 'neural', 'machine-learning'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Natural_language_processing',
        title: 'Wikipedia — Natural Language Processing',
        description:
          'NLP, computational linguistics, text analysis, chatbots, and language models.',
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
        description:
          'Defending digital privacy, free expression, surveillance resistance, and innovation online.',
        priority: 2,
        tags: ['privacy', 'civil-liberties', 'open-web', 'surveillance'],
      },
      {
        url: 'https://owasp.org/www-project-top-ten/',
        title: 'OWASP Top 10 Security Risks',
        description:
          'Standard security awareness document for developers and web application security risks.',
        priority: 2,
        tags: ['security', 'owasp', 'appsec', 'web', 'vulnerability'],
      },
      {
        url: 'https://www.privacytools.io/',
        title: 'Privacy Tools',
        description:
          'Privacy-focused tools, VPNs, browsers, and services to protect your online privacy.',
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
        description:
          'Space exploration, Mars missions, Hubble, James Webb telescope, and earth science from NASA.',
        priority: 1,
        tags: ['space', 'nasa', 'astronomy', 'science', 'mars'],
      },
      {
        url: 'https://arxiv.org/',
        title: 'arXiv — Open Access Research Papers',
        description:
          'Open access preprints in physics, mathematics, computer science, quantitative biology, and economics.',
        priority: 1,
        tags: ['research', 'papers', 'academia', 'science', 'preprint'],
      },
      {
        url: 'https://www.who.int/',
        title: 'World Health Organization (WHO)',
        description:
          'Global health information, disease outbreaks, vaccines, and public health guidelines.',
        priority: 1,
        tags: ['health', 'medicine', 'who', 'global', 'disease'],
      },
      {
        url: 'https://www.cdc.gov/',
        title: 'CDC — Centers for Disease Control and Prevention',
        description:
          'Disease prevention, public health, vaccines, cancer, diabetes, and health statistics.',
        priority: 1,
        tags: ['health', 'cdc', 'disease', 'prevention', 'vaccines'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Physics',
        title: 'Wikipedia — Physics',
        description:
          'The science of matter, energy, motion, gravity, and fundamental forces of the universe.',
        priority: 2,
        tags: ['physics', 'science', 'quantum', 'energy', 'mechanics'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Mathematics',
        title: 'Wikipedia — Mathematics',
        description:
          'Study of numbers, calculus, algebra, geometry, statistics, and mathematical proofs.',
        priority: 2,
        tags: ['math', 'mathematics', 'science', 'calculus', 'algebra'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Chemistry',
        title: 'Wikipedia — Chemistry',
        description:
          'Science of matter, chemical reactions, atoms, molecules, periodic table, and organic chemistry.',
        priority: 2,
        tags: ['chemistry', 'science', 'elements', 'molecules', 'organic'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Biology',
        title: 'Wikipedia — Biology',
        description:
          'Study of life, evolution, genetics, DNA, cells, ecosystems, and living organisms.',
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
        description:
          'International breaking news, business, finance, markets, and world reports from Reuters.',
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
        description:
          'Technology, science, culture, artificial intelligence, and business news from WIRED.',
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
        description:
          'Free interactive coding education with certifications in web development and data science.',
        priority: 1,
        tags: ['learning', 'coding', 'free', 'education', 'web'],
      },
      {
        url: 'https://www.khanacademy.org/',
        title: 'Khan Academy',
        description:
          'Free educational content in math, science, programming, history, and economics.',
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
        description:
          'Expert physician-reviewed health information, diseases, symptoms, and treatment guides.',
        priority: 1,
        tags: ['health', 'medical', 'clinic', 'disease', 'treatment'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Nutrition',
        title: 'Wikipedia — Nutrition',
        description:
          'Science of nutrition, dietary requirements, macros, vitamins, minerals, and food health.',
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
        description:
          'Study of production, distribution, markets, and consumption of goods and services.',
        priority: 1,
        tags: ['economics', 'business', 'finance', 'trade', 'market'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Entrepreneurship',
        title: 'Wikipedia — Entrepreneurship',
        description:
          'Starting businesses, innovation, startups, venture capital, and business creation.',
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
        description:
          'Supply chain management, logistics, manufacturing, and global trade networks.',
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
        description:
          'Comprehensive overview of world history from ancient civilizations to modern times.',
        priority: 1,
        tags: ['history', 'world', 'ancient', 'civilizations'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/World_War_II',
        title: 'Wikipedia — World War II',
        description:
          'Global conflict from 1939 to 1945 involving most of the world nations and major powers.',
        priority: 1,
        tags: ['history', 'war', 'wwii', 'world', 'conflict'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/United_States',
        title: 'Wikipedia — United States',
        description:
          'Overview of the United States, its history, geography, culture, and government.',
        priority: 1,
        tags: ['usa', 'america', 'geography', 'history', 'government'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/India',
        title: 'Wikipedia — India',
        description:
          'Overview of India, its ancient history, culture, technology, economy, and democracy.',
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
        description:
          'European continent, countries, culture, history, geography, and European Union.',
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
        description:
          'History and overview of video games, gaming platforms, consoles, and the gaming industry.',
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
        description:
          'World literature, novels, poetry, plays, famous authors, and literary history.',
        priority: 2,
        tags: ['books', 'literature', 'reading', 'arts', 'novels'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Social_media',
        title: 'Wikipedia — Social Media',
        description:
          'Social media platforms, user-generated content, digital communication, and influence.',
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
        description:
          'Television history, broadcasting, streaming, and popular TV shows and culture.',
        priority: 2,
        tags: ['tv', 'television', 'streaming', 'entertainment'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Sport',
        title: 'Wikipedia — Sports',
        description:
          'Sports overview, major sports types, Olympics, FIFA, and global sporting events.',
        priority: 2,
        tags: ['sports', 'olympics', 'football', 'entertainment'],
      },
    ],
  },
  {
    id: 'ai-modern-tech',
    name: 'Artificial Intelligence & Modern Tech',
    description:
      'Generative AI, Large Language Models, ChatGPT, Claude, Gemini, GPUs, and robotics.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Large_language_model',
        title: 'Wikipedia — Large Language Models',
        description:
          'Large language models, LLMs, transformer architectures, GPT, prompt engineering, and generative AI.',
        priority: 1,
        tags: ['ai', 'llm', 'chatgpt', 'gpt', 'generative-ai', 'transformers'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/ChatGPT',
        title: 'Wikipedia — ChatGPT',
        description:
          'ChatGPT conversational chatbot developed by OpenAI, based on GPT architecture.',
        priority: 1,
        tags: ['chatgpt', 'openai', 'ai', 'chatbot', 'assistant'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Generative_artificial_intelligence',
        title: 'Wikipedia — Generative AI',
        description:
          'Generative artificial intelligence, text-to-image, Midjourney, DALL-E, audio synthesis, and foundation models.',
        priority: 1,
        tags: ['generative-ai', 'image-generation', 'ai', 'midjourney', 'dall-e'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Robotics',
        title: 'Wikipedia — Robotics',
        description:
          'Robotics, autonomous machines, humanoid robots, industrial automation, and sensor systems.',
        priority: 2,
        tags: ['robotics', 'automation', 'hardware', 'engineering', 'ai'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Computer_vision',
        title: 'Wikipedia — Computer Vision',
        description:
          'Computer vision, image recognition, convolutional neural networks, object detection, and autonomous driving.',
        priority: 2,
        tags: ['computer-vision', 'ai', 'image-recognition', 'opencv'],
      },
    ],
  },
  {
    id: 'daily-essentials',
    name: 'Daily Essentials, Weather & Tools',
    description:
      'Weather, maps, currency conversion, time zones, calendars, and everyday utilities.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Weather_forecasting',
        title: 'Wikipedia — Weather Forecasting',
        description:
          'Meteorology, weather forecasts, radar, climate models, temperature, and atmospheric pressure.',
        priority: 1,
        tags: ['weather', 'forecast', 'climate', 'temperature', 'rain'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Global_Positioning_System',
        title: 'Wikipedia — GPS & Maps',
        description:
          'GPS satellite navigation, digital mapping, geographic coordinates, and navigation systems.',
        priority: 1,
        tags: ['gps', 'maps', 'navigation', 'location', 'travel'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Calculator',
        title: 'Wikipedia — Calculator',
        description:
          'Electronic calculators, arithmetic operations, scientific computation, and calculating devices.',
        priority: 2,
        tags: ['calculator', 'math', 'tools', 'arithmetic'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Time_zone',
        title: 'Wikipedia — Time Zones',
        description:
          'Coordinated Universal Time (UTC), standard time zones, daylight saving time, and world clock.',
        priority: 2,
        tags: ['time', 'timezone', 'utc', 'clock', 'world'],
      },
    ],
  },
  {
    id: 'food-cooking',
    name: 'Food, Recipes & Cooking',
    description: 'Cuisine, cooking recipes, baking, nutrition, beverages, and global food culture.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Cooking',
        title: 'Wikipedia — Cooking and Culinary Arts',
        description:
          'Culinary techniques, recipes, baking, grilling, boiling, frying, and flavor preparation.',
        priority: 1,
        tags: ['cooking', 'recipes', 'food', 'culinary', 'kitchen'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Pizza',
        title: 'Wikipedia — Pizza',
        description:
          'History of pizza, Neapolitan pizza, crust styles, toppings, cheese, and Italian cuisine.',
        priority: 1,
        tags: ['pizza', 'food', 'italian', 'recipes', 'baking'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Coffee',
        title: 'Wikipedia — Coffee',
        description:
          'Coffee beans, espresso, roasting, brewing methods, latte, cappuccino, and caffeine.',
        priority: 1,
        tags: ['coffee', 'espresso', 'drinks', 'caffeine', 'beverages'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Tea',
        title: 'Wikipedia — Tea',
        description:
          'Green tea, black tea, herbal tea, chai, tea culture, health benefits, and brewing.',
        priority: 2,
        tags: ['tea', 'beverages', 'green-tea', 'drinks', 'herbal'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Baking',
        title: 'Wikipedia — Baking',
        description: 'Baking breads, cakes, cookies, pastries, yeast fermentation, and desserts.',
        priority: 2,
        tags: ['baking', 'bread', 'pastry', 'dessert', 'recipes'],
      },
    ],
  },
  {
    id: 'personal-finance',
    name: 'Personal Finance & Investing',
    description:
      'Stock market, mutual funds, personal budgeting, credit cards, banking, and real estate.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Stock_market',
        title: 'Wikipedia — Stock Market & Investing',
        description:
          'Stock exchanges, equities, trading, NASDAQ, NYSE, S&P 500, dividends, and portfolio investing.',
        priority: 1,
        tags: ['stocks', 'investing', 'market', 'finance', 'shares'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Personal_finance',
        title: 'Wikipedia — Personal Finance',
        description:
          'Budgeting, savings accounts, emergency funds, debt management, retirement planning, and investing.',
        priority: 1,
        tags: ['finance', 'budget', 'money', 'saving', 'wealth'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Credit_card',
        title: 'Wikipedia — Credit Cards & Banking',
        description:
          'Credit scores, reward points, interest rates, debit cards, loans, and modern banking.',
        priority: 2,
        tags: ['credit-card', 'banking', 'loans', 'credit-score', 'money'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Real_estate',
        title: 'Wikipedia — Real Estate & Housing',
        description:
          'Property buying, mortgages, real estate investment, home ownership, and renting.',
        priority: 2,
        tags: ['real-estate', 'housing', 'mortgage', 'property', 'investment'],
      },
    ],
  },
  {
    id: 'travel-destinations',
    name: 'Travel & Tourism',
    description: 'Travel guides, world cities, airlines, tourism, landmarks, and hotels.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Tourism',
        title: 'Wikipedia — Tourism & Travel',
        description:
          'Global travel, sightseeing, flights, hotels, eco-tourism, backpacking, and trip planning.',
        priority: 1,
        tags: ['travel', 'tourism', 'vacation', 'trips', 'destinations'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Airline',
        title: 'Wikipedia — Airlines & Flights',
        description:
          'Commercial aviation, flight booking, international airports, passenger travel, and airliners.',
        priority: 2,
        tags: ['flights', 'airlines', 'airports', 'travel', 'booking'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Tokyo',
        title: 'Wikipedia — Tokyo',
        description:
          'Tokyo city guide, Japanese culture, districts, transport, landmarks, and technology hub.',
        priority: 2,
        tags: ['tokyo', 'japan', 'travel', 'cities', 'destinations'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/New_York_City',
        title: 'Wikipedia — New York City',
        description:
          'New York City history, boroughs, Manhattan, culture, finance, Broadway, and landmarks.',
        priority: 2,
        tags: ['nyc', 'new-york', 'travel', 'usa', 'cities'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Paris',
        title: 'Wikipedia — Paris',
        description:
          'Paris city guide, Eiffel Tower, Louvre, fashion, French cuisine, and historical monuments.',
        priority: 2,
        tags: ['paris', 'france', 'travel', 'europe', 'landmarks'],
      },
    ],
  },
  {
    id: 'careers-jobs',
    name: 'Careers, Jobs & Productivity',
    description:
      'Resume writing, job searching, remote work, interviews, productivity, and project management.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Resume',
        title: 'Wikipedia — Resume & CV Writing',
        description:
          'Curriculum vitae, job applications, resume formatting, cover letters, and career presentation.',
        priority: 1,
        tags: ['resume', 'cv', 'jobs', 'careers', 'hiring'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Telecommuting',
        title: 'Wikipedia — Remote Work',
        description:
          'Working from home, distributed teams, hybrid work models, and digital nomad lifestyle.',
        priority: 2,
        tags: ['remote-work', 'jobs', 'wfh', 'careers', 'productivity'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Productivity',
        title: 'Wikipedia — Productivity & Time Management',
        description:
          'Productivity systems, Pomodoro technique, task management, focus, and workflow efficiency.',
        priority: 2,
        tags: ['productivity', 'focus', 'time-management', 'habits', 'work'],
      },
    ],
  },
  {
    id: 'popular-dev-frameworks',
    name: 'Popular Web Frameworks & Libraries',
    description:
      'React, Vue, Angular, Next.js, Tailwind CSS, SQL, and modern web engineering tools.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/React_(software)',
        title: 'Wikipedia — React JavaScript Library',
        description:
          'React declarative component-based UI library developed by Meta for web and native apps.',
        priority: 1,
        tags: ['react', 'javascript', 'frontend', 'ui', 'components'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Next.js',
        title: 'Wikipedia — Next.js',
        description:
          'Next.js React framework with server-side rendering, static generation, and full-stack capabilities.',
        priority: 1,
        tags: ['nextjs', 'react', 'javascript', 'frontend', 'ssr'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/SQL',
        title: 'Wikipedia — Structured Query Language (SQL)',
        description:
          'SQL relational database querying, schema design, indexes, joins, and transactions.',
        priority: 1,
        tags: ['sql', 'database', 'queries', 'postgres', 'mysql'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/REST',
        title: 'Wikipedia — REST API Architecture',
        description:
          'Representational State Transfer (REST), HTTP methods, endpoints, JSON, and web services.',
        priority: 2,
        tags: ['rest', 'api', 'http', 'backend', 'json', 'web'],
      },
    ],
  },
  {
    id: 'smartphones-hardware',
    name: 'Smartphones & Consumer Tech',
    description: 'Smartphones, Android, iOS, Apple, laptops, smart home, and wearable electronics.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Smartphone',
        title: 'Wikipedia — Smartphone Technology',
        description:
          'Mobile operating systems, touchscreen displays, processors, camera sensors, and 5G networks.',
        priority: 1,
        tags: ['smartphones', 'mobile', 'iphone', 'android', 'gadgets'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Android_(operating_system)',
        title: 'Wikipedia — Android OS',
        description:
          'Android mobile operating system developed by Google, APKs, Google Play, and open-source ecosystem.',
        priority: 1,
        tags: ['android', 'google', 'mobile', 'os', 'apps'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/IOS',
        title: 'Wikipedia — Apple iOS',
        description:
          'Apple iOS mobile operating system for iPhone, iPadOS, App Store, and Apple silicon.',
        priority: 1,
        tags: ['ios', 'apple', 'iphone', 'mobile', 'apps'],
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
        description:
          'Solar, wind, hydro, and other renewable energy sources for sustainable power.',
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
        description:
          'Deforestation causes, effects on climate change, biodiversity loss, and solutions.',
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
  return allSeeds.sort((a, b) => a.priority - b.priority).map(s => s.url);
}

/**
 * Returns all seed entries across all categories.
 */
export function getAllCuratedSeeds(): SeedEntry[] {
  return CURATED_SEED_CORPUS.flatMap(cat => cat.seeds);
}
