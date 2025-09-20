import OpenAI from 'openai';

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

export interface ProblemAnalysis {
  isActionableProblem: boolean;
  confidence: number;
  problemStatement: string;
  painIntensity: number; // 1-10
  willingness_to_pay_signals: number; // 0-5
  technical_feasibility: number; // 1-10 (10 = easy weekend project)
  market_demand_signals: number; // 1-10
  workflow_clarity: number; // 1-10
  rationale: string;
}

export interface ClusterAnalysis {
  title: string;
  summary: string;
  target_users: string;
  solution_approach: string;
  key_features: string[];
  technical_complexity: 'Weekend build' | '1-2 weeks' | 'Complex';
  estimated_effort_days: number;
  monetization_potential: string;
  competitive_landscape: string;
  risks: string[];
}

const PROBLEM_ANALYSIS_PROMPT = `
You are an expert at identifying concrete, buildable automation opportunities from Reddit posts.

Analyze this Reddit post and determine if it describes a concrete workflow problem that could be solved by a small automation tool, script, or simple web app.

ACTIONABLE CRITERIA (must meet most):
- Describes concrete workflow pain (manual, repetitive, time-consuming tasks)
- Has specific inputs/outputs or clear process steps
- Mentions tools/platforms that could be integrated
- Scope is narrow enough for a small automation solution
- Shows business/professional context (not personal hobby)

NOT ACTIONABLE:
- General discussions, opinions, debates
- Life advice or career questions
- Pure announcements or gratitude posts
- Requests for large platforms or comprehensive solutions
- Bug reports without generalizable workflow

For each post, extract:
1. Whether it's an actionable problem (boolean)
2. Confidence level (0-1)
3. Clear problem statement (1-2 sentences)
4. Pain intensity (1-10: how much time/frustration does this cause?)
5. Willingness to pay signals (0-5: mentions of budget, paying for solutions, time value)
6. Technical feasibility (1-10: how easy to build? 10 = simple automation, 1 = very complex)
7. Market demand signals (1-10: how many people likely have this problem?)
8. Workflow clarity (1-10: how well-defined are the steps?)
9. Brief rationale for your assessment

Post Title: {title}
Post Content: {content}

Response format (JSON):
{
  "isActionableProblem": boolean,
  "confidence": number,
  "problemStatement": "string",
  "painIntensity": number,
  "willingness_to_pay_signals": number,
  "technical_feasibility": number,
  "market_demand_signals": number,
  "workflow_clarity": number,
  "rationale": "string"
}
`;

const CLUSTER_ANALYSIS_PROMPT = `
You are a product strategist analyzing clusters of similar workflow problems to identify viable micro-SaaS opportunities.

Given this cluster of related problem posts, synthesize them into a cohesive app idea:

CLUSTER DATA:
{cluster_data}

Provide a comprehensive analysis including:
1. Compelling app title (focus on the core workflow being automated)
2. Executive summary (2-3 sentences)
3. Target user persona
4. High-level solution approach
5. 3-5 key features that address the core problems
6. Technical complexity assessment
7. Development effort estimate
8. Monetization strategy and potential
9. Competitive landscape analysis
10. Main risks and mitigation strategies

Focus on solutions that:
- Can be built by a solo developer or small team
- Have clear monetization paths
- Address frequent, painful workflows
- Leverage existing APIs and integrations

Response format (JSON):
{
  "title": "string",
  "summary": "string",
  "target_users": "string",
  "solution_approach": "string",
  "key_features": ["string"],
  "technical_complexity": "Weekend build" | "1-2 weeks" | "Complex",
  "estimated_effort_days": number,
  "monetization_potential": "string",
  "competitive_landscape": "string",
  "risks": ["string"]
}
`;

export async function analyzeProblemWithLLM(title: string, content: string): Promise<ProblemAnalysis> {
  try {
    const client = getOpenAIClient();
    const prompt = PROBLEM_ANALYSIS_PROMPT
      .replace('{title}', title)
      .replace('{content}', content);

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    return {
      isActionableProblem: result.isActionableProblem || false,
      confidence: Math.max(0, Math.min(1, result.confidence || 0)),
      problemStatement: result.problemStatement || '',
      painIntensity: Math.max(1, Math.min(10, result.painIntensity || 1)),
      willingness_to_pay_signals: Math.max(0, Math.min(5, result.willingness_to_pay_signals || 0)),
      technical_feasibility: Math.max(1, Math.min(10, result.technical_feasibility || 5)),
      market_demand_signals: Math.max(1, Math.min(10, result.market_demand_signals || 1)),
      workflow_clarity: Math.max(1, Math.min(10, result.workflow_clarity || 1)),
      rationale: result.rationale || 'No rationale provided'
    };
  } catch (error) {
    console.error('LLM analysis failed:', error);
    return {
      isActionableProblem: false,
      confidence: 0,
      problemStatement: '',
      painIntensity: 1,
      willingness_to_pay_signals: 0,
      technical_feasibility: 5,
      market_demand_signals: 1,
      workflow_clarity: 1,
      rationale: 'LLM analysis failed'
    };
  }
}

export async function analyzeClusterWithLLM(clusterData: any): Promise<ClusterAnalysis> {
  try {
    const client = getOpenAIClient();
    const prompt = CLUSTER_ANALYSIS_PROMPT.replace('{cluster_data}', JSON.stringify(clusterData, null, 2));

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    return {
      title: result.title || 'Workflow Automation Tool',
      summary: result.summary || '',
      target_users: result.target_users || '',
      solution_approach: result.solution_approach || '',
      key_features: result.key_features || [],
      technical_complexity: result.technical_complexity || '1-2 weeks',
      estimated_effort_days: result.estimated_effort_days || 14,
      monetization_potential: result.monetization_potential || '',
      competitive_landscape: result.competitive_landscape || '',
      risks: result.risks || []
    };
  } catch (error) {
    console.error('Cluster LLM analysis failed:', error);
    return {
      title: 'Workflow Automation Tool',
      summary: 'Analysis failed',
      target_users: 'Unknown',
      solution_approach: 'Unknown',
      key_features: [],
      technical_complexity: '1-2 weeks',
      estimated_effort_days: 14,
      monetization_potential: 'Unknown',
      competitive_landscape: 'Unknown',
      risks: ['Analysis failed']
    };
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const client = getOpenAIClient();
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return [];
  }
}

export async function batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const client = getOpenAIClient();
    // Process in batches of 100 to stay within API limits
    const batchSize = 100;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
      });

      embeddings.push(...response.data.map(d => d.embedding));
    }

    return embeddings;
  } catch (error) {
    console.error('Batch embedding generation failed:', error);
    return [];
  }
}