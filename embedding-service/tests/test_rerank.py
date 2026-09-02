"""
Unit tests for cross-encoder reranker in embedding-service.
"""
import unittest
from app.config import Settings
from app.reranker import load_reranker, is_reranker_ready, rerank_documents, get_reranker_info


class TestReranker(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = Settings(
            reranker_model="cross-encoder/ms-marco-MiniLM-L-6-v2",
            reranker_enabled=True,
        )
        load_reranker(settings)

    def test_reranker_is_ready(self):
        self.assertTrue(is_reranker_ready())
        info = get_reranker_info()
        self.assertTrue(info["ready"])
        self.assertEqual(info["model_name"], "cross-encoder/ms-marco-MiniLM-L-6-v2")

    def test_rerank_documents_ordering(self):
        query = "What is a binary search tree?"
        docs = [
            "Photosynthesis is the process by which green plants convert sunlight into chemical energy.",
            "A binary search tree is a rooted binary tree data structure where each node has at most two children.",
            "The capital of France is Paris, located on the Seine river.",
            "Binary tree traversals include inorder, preorder, and postorder traversal methods.",
        ]
        results = rerank_documents(query, docs, top_k=2)
        self.assertEqual(len(results), 2)
        # The BST document (index 1) should be ranked highest
        self.assertEqual(results[0]["index"], 1)
        self.assertGreater(results[0]["score"], results[1]["score"])

    def test_rerank_empty_documents(self):
        results = rerank_documents("query", [])
        self.assertEqual(results, [])


if __name__ == "__main__":
    unittest.main()
