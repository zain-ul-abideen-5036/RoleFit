import { normalizeText } from '@/lib/matching/normalize'

/**
 * Skill alias dictionary.
 *
 * Three relationships, deliberately distinct:
 *
 *  - `aliases`  — different names for the *same* thing. Full credit both ways.
 *                 "Postgres" and "PostgreSQL" are the same skill.
 *  - `implies`  — holding this skill demonstrably evidences another. Directional
 *                 and full credit one way only: PostgreSQL implies SQL, but SQL
 *                 does not imply PostgreSQL.
 *  - `related`  — adjacent, not equivalent. Partial credit only, and never
 *                 enough on its own to mark a requirement satisfied.
 *
 * The distinction matters because the product's core promise is not inventing
 * qualifications. Collapsing `implies` and `related` into one bucket is how a
 * matcher ends up claiming a GCP user "has AWS".
 */
export interface SkillDefinition {
  canonical: string
  /** Display form used in the UI. */
  label: string
  aliases: readonly string[]
  implies?: readonly string[]
  related?: readonly string[]
  category:
    | 'language'
    | 'framework'
    | 'database'
    | 'cloud'
    | 'devops'
    | 'data'
    | 'design'
    | 'product'
    | 'practice'
    | 'tool'
}

export const SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  // ------------------------------------------------------------- languages
  {
    canonical: 'javascript',
    label: 'JavaScript',
    aliases: ['js', 'ecmascript', 'es6', 'es2015', 'vanilla js'],
    category: 'language',
  },
  {
    canonical: 'typescript',
    label: 'TypeScript',
    aliases: ['ts'],
    implies: ['javascript'],
    category: 'language',
  },
  {
    canonical: 'python',
    label: 'Python',
    aliases: ['python3', 'py'],
    category: 'language',
  },
  {
    // Deliberately has no relationship to JavaScript.
    canonical: 'java',
    label: 'Java',
    aliases: ['java se', 'java ee', 'j2ee', 'core java'],
    category: 'language',
  },
  { canonical: 'csharp', label: 'C#', aliases: ['c sharp'], category: 'language' },
  { canonical: 'cplusplus', label: 'C++', aliases: ['cpp'], category: 'language' },
  { canonical: 'c', label: 'C', aliases: [], category: 'language' },
  { canonical: 'go', label: 'Go', aliases: ['golang'], category: 'language' },
  { canonical: 'rust', label: 'Rust', aliases: [], category: 'language' },
  { canonical: 'ruby', label: 'Ruby', aliases: [], category: 'language' },
  { canonical: 'php', label: 'PHP', aliases: [], category: 'language' },
  { canonical: 'swift', label: 'Swift', aliases: [], category: 'language' },
  { canonical: 'kotlin', label: 'Kotlin', aliases: [], category: 'language' },
  { canonical: 'scala', label: 'Scala', aliases: [], category: 'language' },
  { canonical: 'r', label: 'R', aliases: ['r language', 'r programming'], category: 'language' },
  { canonical: 'matlab', label: 'MATLAB', aliases: [], category: 'language' },
  { canonical: 'bash', label: 'Bash', aliases: ['shell scripting', 'shell', 'zsh'], category: 'language' },
  { canonical: 'html', label: 'HTML', aliases: ['html5'], category: 'language' },
  { canonical: 'css', label: 'CSS', aliases: ['css3'], category: 'language' },

  // ------------------------------------------------------------ frameworks
  {
    canonical: 'react',
    label: 'React',
    aliases: ['reactjs', 'react hooks'],
    implies: ['javascript'],
    category: 'framework',
  },
  {
    canonical: 'nextjs',
    label: 'Next.js',
    aliases: ['next'],
    implies: ['react', 'javascript'],
    category: 'framework',
  },
  {
    canonical: 'vuejs',
    label: 'Vue.js',
    aliases: ['vue'],
    implies: ['javascript'],
    category: 'framework',
  },
  {
    canonical: 'angular',
    label: 'Angular',
    aliases: ['angularjs', 'angular 2'],
    implies: ['javascript'],
    category: 'framework',
  },
  { canonical: 'svelte', label: 'Svelte', aliases: ['sveltekit'], implies: ['javascript'], category: 'framework' },
  {
    canonical: 'nodejs',
    label: 'Node.js',
    aliases: ['node'],
    implies: ['javascript'],
    category: 'framework',
  },
  { canonical: 'expressjs', label: 'Express', aliases: ['express'], implies: ['nodejs'], category: 'framework' },
  { canonical: 'nestjs', label: 'NestJS', aliases: ['nest'], implies: ['nodejs', 'typescript'], category: 'framework' },
  { canonical: 'django', label: 'Django', aliases: [], implies: ['python'], category: 'framework' },
  { canonical: 'flask', label: 'Flask', aliases: [], implies: ['python'], category: 'framework' },
  { canonical: 'fastapi', label: 'FastAPI', aliases: [], implies: ['python'], category: 'framework' },
  { canonical: 'spring', label: 'Spring', aliases: ['spring boot', 'springboot'], implies: ['java'], category: 'framework' },
  { canonical: 'dotnet', label: '.NET', aliases: ['dotnetcore', 'aspnet', 'aspnetcore', 'net core'], implies: ['csharp'], category: 'framework' },
  { canonical: 'rails', label: 'Ruby on Rails', aliases: ['ruby on rails', 'ror'], implies: ['ruby'], category: 'framework' },
  { canonical: 'laravel', label: 'Laravel', aliases: [], implies: ['php'], category: 'framework' },
  { canonical: 'tailwindcss', label: 'Tailwind CSS', aliases: ['tailwind'], implies: ['css'], category: 'framework' },
  { canonical: 'reactnative', label: 'React Native', aliases: ['react native'], implies: ['react'], category: 'framework' },
  { canonical: 'flutter', label: 'Flutter', aliases: [], related: ['dart'], category: 'framework' },

  // ------------------------------------------------------------- databases
  {
    canonical: 'sql',
    label: 'SQL',
    aliases: ['structured query language'],
    category: 'database',
  },
  {
    canonical: 'postgresql',
    label: 'PostgreSQL',
    aliases: ['postgres', 'psql', 'postgre sql'],
    implies: ['sql'],
    category: 'database',
  },
  { canonical: 'mysql', label: 'MySQL', aliases: ['my sql'], implies: ['sql'], category: 'database' },
  { canonical: 'sqlserver', label: 'SQL Server', aliases: ['mssql', 'microsoft sql server', 'sql server'], implies: ['sql'], category: 'database' },
  { canonical: 'oracle', label: 'Oracle Database', aliases: ['oracle db', 'oracle database', 'plsql', 'pl sql'], implies: ['sql'], category: 'database' },
  { canonical: 'sqlite', label: 'SQLite', aliases: [], implies: ['sql'], category: 'database' },
  { canonical: 'mongodb', label: 'MongoDB', aliases: ['mongo'], related: ['nosql'], category: 'database' },
  { canonical: 'nosql', label: 'NoSQL', aliases: ['no sql'], category: 'database' },
  { canonical: 'redis', label: 'Redis', aliases: [], related: ['nosql'], category: 'database' },
  { canonical: 'dynamodb', label: 'DynamoDB', aliases: ['dynamo db'], related: ['nosql'], category: 'database' },
  { canonical: 'elasticsearch', label: 'Elasticsearch', aliases: ['elastic search', 'opensearch'], category: 'database' },

  // ----------------------------------------------------------------- cloud
  // Cloud providers are intentionally NOT aliases or implications of one
  // another. AWS experience is not GCP experience.
  {
    canonical: 'aws',
    label: 'AWS',
    aliases: ['amazon web services'],
    related: ['cloud'],
    category: 'cloud',
  },
  {
    canonical: 'gcp',
    label: 'Google Cloud',
    aliases: ['google cloud', 'google cloud platform'],
    related: ['cloud'],
    category: 'cloud',
  },
  {
    canonical: 'azure',
    label: 'Microsoft Azure',
    aliases: ['microsoft azure', 'ms azure'],
    related: ['cloud'],
    category: 'cloud',
  },
  { canonical: 'cloud', label: 'Cloud platforms', aliases: ['cloud computing', 'cloud platforms'], category: 'cloud' },
  { canonical: 'lambda', label: 'AWS Lambda', aliases: ['aws lambda'], implies: ['aws', 'serverless'], category: 'cloud' },
  { canonical: 'serverless', label: 'Serverless', aliases: [], category: 'cloud' },
  { canonical: 's3', label: 'Amazon S3', aliases: ['aws s3', 'amazon s3'], implies: ['aws'], category: 'cloud' },

  // ---------------------------------------------------------------- devops
  { canonical: 'docker', label: 'Docker', aliases: ['containerization', 'containers'], category: 'devops' },
  { canonical: 'kubernetes', label: 'Kubernetes', aliases: ['k8s'], related: ['docker'], category: 'devops' },
  { canonical: 'terraform', label: 'Terraform', aliases: [], implies: ['iac'], category: 'devops' },
  { canonical: 'iac', label: 'Infrastructure as Code', aliases: ['infrastructure as code'], category: 'devops' },
  { canonical: 'cicd', label: 'CI/CD', aliases: ['continuous integration', 'continuous delivery', 'continuous deployment'], category: 'devops' },
  { canonical: 'githubactions', label: 'GitHub Actions', aliases: ['github actions'], implies: ['cicd'], category: 'devops' },
  { canonical: 'jenkins', label: 'Jenkins', aliases: [], implies: ['cicd'], category: 'devops' },
  { canonical: 'gitlabci', label: 'GitLab CI', aliases: ['gitlab ci', 'gitlab ci cd'], implies: ['cicd'], category: 'devops' },
  { canonical: 'git', label: 'Git', aliases: ['version control', 'github', 'gitlab', 'bitbucket'], category: 'devops' },
  { canonical: 'linux', label: 'Linux', aliases: ['unix', 'ubuntu', 'debian'], category: 'devops' },
  { canonical: 'nginx', label: 'Nginx', aliases: [], category: 'devops' },
  { canonical: 'ansible', label: 'Ansible', aliases: [], implies: ['iac'], category: 'devops' },
  { canonical: 'prometheus', label: 'Prometheus', aliases: [], related: ['observability'], category: 'devops' },
  { canonical: 'observability', label: 'Observability', aliases: ['monitoring', 'monitoring and alerting'], category: 'devops' },

  // ------------------------------------------------------------------ data
  {
    canonical: 'machinelearning',
    label: 'Machine Learning',
    aliases: ['ml', 'machine learning'],
    category: 'data',
  },
  {
    canonical: 'deeplearning',
    label: 'Deep Learning',
    aliases: ['dl', 'deep learning', 'neural networks'],
    implies: ['machinelearning'],
    category: 'data',
  },
  {
    canonical: 'nlp',
    label: 'Natural Language Processing',
    aliases: ['natural language processing'],
    implies: ['machinelearning'],
    category: 'data',
  },
  {
    canonical: 'computervision',
    label: 'Computer Vision',
    aliases: ['computer vision', 'cv'],
    implies: ['machinelearning'],
    category: 'data',
  },
  { canonical: 'tensorflow', label: 'TensorFlow', aliases: ['tf'], implies: ['deeplearning', 'python'], category: 'data' },
  { canonical: 'pytorch', label: 'PyTorch', aliases: ['torch'], implies: ['deeplearning', 'python'], category: 'data' },
  { canonical: 'scikitlearn', label: 'scikit-learn', aliases: ['sklearn', 'scikit learn'], implies: ['machinelearning', 'python'], category: 'data' },
  { canonical: 'pandas', label: 'pandas', aliases: [], implies: ['python'], category: 'data' },
  { canonical: 'numpy', label: 'NumPy', aliases: [], implies: ['python'], category: 'data' },
  { canonical: 'spark', label: 'Apache Spark', aliases: ['apache spark', 'pyspark'], category: 'data' },
  { canonical: 'airflow', label: 'Apache Airflow', aliases: ['apache airflow'], related: ['dataengineering'], category: 'data' },
  { canonical: 'kafka', label: 'Apache Kafka', aliases: ['apache kafka'], category: 'data' },
  { canonical: 'dataengineering', label: 'Data Engineering', aliases: ['data engineering', 'etl', 'elt', 'data pipelines'], category: 'data' },
  { canonical: 'datavisualization', label: 'Data Visualization', aliases: ['data visualization', 'data visualisation', 'dataviz'], category: 'data' },
  { canonical: 'tableau', label: 'Tableau', aliases: [], implies: ['datavisualization'], category: 'data' },
  { canonical: 'powerbi', label: 'Power BI', aliases: ['power bi', 'powerbi'], implies: ['datavisualization'], category: 'data' },
  { canonical: 'statistics', label: 'Statistics', aliases: ['statistical analysis'], category: 'data' },
  { canonical: 'llm', label: 'Large Language Models', aliases: ['large language models', 'llms', 'generative ai', 'genai'], implies: ['machinelearning'], category: 'data' },

  // ---------------------------------------------------------------- design
  { canonical: 'figma', label: 'Figma', aliases: [], category: 'design' },
  { canonical: 'uxdesign', label: 'UX Design', aliases: ['ux', 'user experience', 'user experience design'], category: 'design' },
  { canonical: 'uidesign', label: 'UI Design', aliases: ['ui', 'user interface design'], category: 'design' },
  { canonical: 'designsystems', label: 'Design Systems', aliases: ['design system'], category: 'design' },
  { canonical: 'userresearch', label: 'User Research', aliases: ['user research', 'usability testing'], category: 'design' },
  { canonical: 'prototyping', label: 'Prototyping', aliases: ['wireframing'], category: 'design' },
  { canonical: 'accessibility', label: 'Accessibility', aliases: ['a11y', 'wcag'], category: 'design' },

  // --------------------------------------------------------------- product
  { canonical: 'productmanagement', label: 'Product Management', aliases: ['product management', 'product strategy'], category: 'product' },
  { canonical: 'roadmapping', label: 'Roadmapping', aliases: ['product roadmap', 'roadmap planning'], category: 'product' },
  { canonical: 'stakeholdermanagement', label: 'Stakeholder Management', aliases: ['stakeholder management', 'stakeholder engagement'], category: 'product' },
  { canonical: 'abtesting', label: 'A/B Testing', aliases: ['ab testing', 'experimentation'], category: 'product' },
  { canonical: 'analytics', label: 'Product Analytics', aliases: ['product analytics', 'google analytics', 'mixpanel', 'amplitude'], category: 'product' },
  { canonical: 'jira', label: 'Jira', aliases: ['atlassian jira'], category: 'tool' },

  // -------------------------------------------------------------- practice
  { canonical: 'agile', label: 'Agile', aliases: ['agile methodology', 'agile methodologies'], category: 'practice' },
  { canonical: 'scrum', label: 'Scrum', aliases: [], implies: ['agile'], category: 'practice' },
  { canonical: 'kanban', label: 'Kanban', aliases: [], implies: ['agile'], category: 'practice' },
  { canonical: 'testing', label: 'Testing', aliases: ['unit testing', 'automated testing', 'test automation'], category: 'practice' },
  { canonical: 'tdd', label: 'Test-Driven Development', aliases: ['test driven development'], implies: ['testing'], category: 'practice' },
  { canonical: 'codereview', label: 'Code Review', aliases: ['code reviews', 'peer review'], category: 'practice' },
  { canonical: 'microservices', label: 'Microservices', aliases: ['microservice architecture'], category: 'practice' },
  { canonical: 'restapi', label: 'REST APIs', aliases: ['rest', 'restful', 'restful apis', 'rest api'], category: 'practice' },
  { canonical: 'graphql', label: 'GraphQL', aliases: [], category: 'practice' },
  { canonical: 'systemdesign', label: 'System Design', aliases: ['system design', 'distributed systems', 'software architecture'], category: 'practice' },
  { canonical: 'security', label: 'Security', aliases: ['application security', 'appsec', 'cybersecurity'], category: 'practice' },
  { canonical: 'mentoring', label: 'Mentoring', aliases: ['mentorship', 'coaching'], category: 'practice' },
  { canonical: 'communication', label: 'Communication', aliases: ['written communication', 'verbal communication'], category: 'practice' },
  { canonical: 'leadership', label: 'Leadership', aliases: ['team leadership', 'technical leadership'], category: 'practice' },
  { canonical: 'problemsolving', label: 'Problem Solving', aliases: ['problem-solving', 'analytical thinking'], category: 'practice' },
  { canonical: 'collaboration', label: 'Collaboration', aliases: ['cross functional collaboration', 'teamwork'], category: 'practice' },
] as const

/* ==========================================================================
   Indexes — built once at module load
   ========================================================================== */

const byCanonical = new Map<string, SkillDefinition>()
/** Every surface form (canonical + aliases), normalized, to its definition. */
const bySurfaceForm = new Map<string, SkillDefinition>()

for (const definition of SKILL_DEFINITIONS) {
  byCanonical.set(definition.canonical, definition)
  bySurfaceForm.set(normalizeText(definition.canonical), definition)
  bySurfaceForm.set(normalizeText(definition.label), definition)
  for (const alias of definition.aliases) {
    bySurfaceForm.set(normalizeText(alias), definition)
  }
}

/** Resolves any spelling of a skill to its definition, or null if unknown. */
export function resolveSkill(text: string): SkillDefinition | null {
  return bySurfaceForm.get(normalizeText(text)) ?? null
}

/** Canonical token for a skill name, falling back to its normalized form. */
export function canonicalize(text: string): string {
  return resolveSkill(text)?.canonical ?? normalizeText(text)
}

export function getSkillDefinition(canonical: string): SkillDefinition | null {
  return byCanonical.get(canonical) ?? null
}

/** Human-readable label for a canonical token. */
export function skillLabel(canonical: string): string {
  return byCanonical.get(canonical)?.label ?? canonical
}

/**
 * The canonical tokens a candidate demonstrably evidences by holding `canonical`
 * — itself plus everything it transitively implies. Cycles are guarded.
 */
export function expandImplications(canonical: string): Set<string> {
  const result = new Set<string>([canonical])
  const queue = [canonical]

  while (queue.length > 0) {
    const current = queue.pop()!
    const definition = byCanonical.get(current)
    if (!definition?.implies) continue
    for (const implied of definition.implies) {
      if (!result.has(implied)) {
        result.add(implied)
        queue.push(implied)
      }
    }
  }
  return result
}

/** Adjacent skills that earn partial credit only. Never full credit. */
export function relatedSkills(canonical: string): readonly string[] {
  return byCanonical.get(canonical)?.related ?? []
}

/**
 * Every surface form worth searching for when hunting evidence of `canonical`.
 * Used by the matcher to scan resume text.
 */
export function surfaceFormsFor(canonical: string): string[] {
  const definition = byCanonical.get(canonical)
  if (!definition) return [canonical]
  return [definition.canonical, definition.label, ...definition.aliases]
}

/** All canonical tokens known to the dictionary. Used by the JD keyword pass. */
export function knownSkillTokens(): readonly string[] {
  return SKILL_DEFINITIONS.map((definition) => definition.canonical)
}
