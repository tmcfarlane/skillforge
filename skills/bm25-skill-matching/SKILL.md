# BM25 Skill Matching

Rank a corpus of {skill_documents} against a free-text query using the BM25 probabilistic ranking function. Returns the top-N most relevant documents with snippets and matched terms. No external dependencies — pure TypeScript implementation.

## When to Use

Use when you need text relevance ranking over a document corpus where:
- The corpus fits in memory (< 10K documents)
- No vector database or embedding model is available
- You need deterministic, explainable ranking
- Keyword overlap matters more than semantic similarity

For semantic similarity over large corpora, prefer embedding-based retrieval (P2-02).

## Steps

1. **Tokenize documents and query** — lowercase, remove stopwords, split on non-alphanumeric characters. Filter tokens shorter than 2 characters.

2. **Build an inverted index** — `Map<term, Map<docId, termFrequency>>`. Build once at query time from the live corpus.

3. **Compute IDF per term** — `log((N - df + 0.5) / (df + 0.5) + 1)` where N = total docs, df = number of docs containing term.

4. **Compute TF normalization** — `(tf * (K1+1)) / (tf + K1 * (1 - B + B * (docLen / avgDocLen)))` with K1=1.5, B=0.75.

5. **Sum IDF × TF-norm across all query terms** — skip terms not in document.

6. **Sort by BM25 score descending** — break ties by existing composite score.

7. **Extract snippet** — find the document line with the most query term hits. Truncate to maxLen chars.

8. **Return top-N candidates** — filter out docs with BM25 score of 0 (no overlap).

## Algorithm

```
query → tokenize → queryTokens[]
corpus → tokenize each doc → tokens[][]
build invertedIndex: term → {docId → tf}
avgDocLen = sum(docLens) / N

for each doc:
  score = 0
  for each queryToken:
    tf = invertedIndex[token][docId] ?? 0
    if tf == 0: continue
    idf = log((N - df + 0.5) / (df + 0.5) + 1)
    tfNorm = (tf * (K1+1)) / (tf + K1*(1 - B + B*(len/avg)))
    score += idf * tfNorm

sort desc → slice topN → return candidates
```

## Primitives

- search, data-transform, aggregate

## Tags

bm25, text-search, ranking, typescript, information-retrieval
