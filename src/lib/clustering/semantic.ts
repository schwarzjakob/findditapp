import { generateEmbedding, batchGenerateEmbeddings } from '@/lib/llm/openai';
import type { ProblemPhrase, RedditPost } from '@/lib/types';

export interface SemanticCluster {
  id: string;
  centroid: number[];
  phrases: ProblemPhrase[];
  posts: RedditPost[];
  coherence_score: number;
  size: number;
}

export interface ClusteringResult {
  clusters: SemanticCluster[];
  noise_points: ProblemPhrase[];
  silhouette_score: number;
}

// Simple distance calculation for embeddings
function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

// Simple density-based clustering implementation
export async function clusterSemanticProblems(
  phrases: ProblemPhrase[],
  posts: RedditPost[],
  options: {
    minClusterSize?: number;
    maxDistance?: number;
    similarityThreshold?: number;
  } = {}
): Promise<ClusteringResult> {
  const {
    minClusterSize = 3,
    maxDistance = 0.3,
    similarityThreshold = 0.7
  } = options;

  if (phrases.length === 0) {
    return { clusters: [], noise_points: [], silhouette_score: 0 };
  }

  // Generate embeddings for all phrases
  const texts = phrases.map(p => `${p.phrase} ${p.snippet}`);
  const embeddings = await batchGenerateEmbeddings(texts);

  if (embeddings.length === 0 || embeddings.some(e => e.length === 0)) {
    console.error('Failed to generate embeddings');
    return { clusters: [], noise_points: phrases, silhouette_score: 0 };
  }

  // Create post lookup map
  const postMap = new Map(posts.map(p => [p.id, p]));

  // Simple clustering algorithm
  const clusters: SemanticCluster[] = [];
  const clustered = new Set<number>();
  const noise: ProblemPhrase[] = [];

  for (let i = 0; i < phrases.length; i++) {
    if (clustered.has(i)) continue;

    const neighbors: number[] = [];

    // Find all neighbors within similarity threshold
    for (let j = 0; j < phrases.length; j++) {
      if (i === j) continue;

      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
      if (similarity >= similarityThreshold) {
        neighbors.push(j);
      }
    }

    // If we have enough neighbors, create a cluster
    if (neighbors.length + 1 >= minClusterSize) {
      const clusterPhrases = [phrases[i], ...neighbors.map(idx => phrases[idx])];
      const clusterPosts = clusterPhrases
        .map(p => postMap.get(p.postId))
        .filter(Boolean) as RedditPost[];

      // Calculate centroid
      const allIndices = [i, ...neighbors];
      const centroid = embeddings[i].map((_, dim) =>
        allIndices.reduce((sum, idx) => sum + embeddings[idx][dim], 0) / allIndices.length
      );

      // Calculate coherence score (average similarity within cluster)
      let totalSimilarity = 0;
      let comparisons = 0;

      for (let x = 0; x < allIndices.length; x++) {
        for (let y = x + 1; y < allIndices.length; y++) {
          totalSimilarity += cosineSimilarity(embeddings[allIndices[x]], embeddings[allIndices[y]]);
          comparisons++;
        }
      }

      const coherenceScore = comparisons > 0 ? totalSimilarity / comparisons : 0;

      clusters.push({
        id: `semantic_cluster_${clusters.length}`,
        centroid,
        phrases: clusterPhrases,
        posts: clusterPosts,
        coherence_score: coherenceScore,
        size: clusterPhrases.length
      });

      // Mark all points as clustered
      clustered.add(i);
      neighbors.forEach(idx => clustered.add(idx));
    }
  }

  // Add unclustered points to noise
  for (let i = 0; i < phrases.length; i++) {
    if (!clustered.has(i)) {
      noise.push(phrases[i]);
    }
  }

  // Calculate overall silhouette score (simplified)
  const silhouetteScore = clusters.length > 0
    ? clusters.reduce((sum, cluster) => sum + cluster.coherence_score, 0) / clusters.length
    : 0;

  // Sort clusters by coherence score
  clusters.sort((a, b) => b.coherence_score - a.coherence_score);

  return {
    clusters,
    noise_points: noise,
    silhouette_score: silhouetteScore
  };
}

export async function findSimilarClusters(
  targetCluster: SemanticCluster,
  otherClusters: SemanticCluster[],
  threshold: number = 0.8
): Promise<SemanticCluster[]> {
  const similar: SemanticCluster[] = [];

  for (const cluster of otherClusters) {
    if (cluster.id === targetCluster.id) continue;

    const similarity = cosineSimilarity(targetCluster.centroid, cluster.centroid);
    if (similarity >= threshold) {
      similar.push(cluster);
    }
  }

  return similar.sort((a, b) =>
    cosineSimilarity(targetCluster.centroid, b.centroid) -
    cosineSimilarity(targetCluster.centroid, a.centroid)
  );
}

export function mergeClusters(cluster1: SemanticCluster, cluster2: SemanticCluster): SemanticCluster {
  const mergedPhrases = [...cluster1.phrases, ...cluster2.phrases];
  const mergedPosts = [...cluster1.posts, ...cluster2.posts];

  // Calculate new centroid
  const totalSize = cluster1.size + cluster2.size;
  const newCentroid = cluster1.centroid.map((val, i) =>
    (val * cluster1.size + cluster2.centroid[i] * cluster2.size) / totalSize
  );

  // Recalculate coherence score
  const coherenceScore = (cluster1.coherence_score * cluster1.size + cluster2.coherence_score * cluster2.size) / totalSize;

  return {
    id: `merged_${cluster1.id}_${cluster2.id}`,
    centroid: newCentroid,
    phrases: mergedPhrases,
    posts: mergedPosts,
    coherence_score: coherenceScore,
    size: totalSize
  };
}

export function filterHighQualityClusters(
  clusters: SemanticCluster[],
  minCoherence: number = 0.6,
  minSize: number = 3
): SemanticCluster[] {
  return clusters.filter(cluster =>
    cluster.coherence_score >= minCoherence &&
    cluster.size >= minSize
  );
}