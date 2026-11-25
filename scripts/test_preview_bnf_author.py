import unittest
import urllib.parse
from preview_bnf_author import request_url, parse
FIXTURE = b"""<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/" xmlns:dc="http://purl.org/dc/elements/1.1/"><numberOfRecords>21</numberOfRecords><records><record><recordIdentifier>ark:/12148/cb123456789</recordIdentifier><recordData><dc:dc><dc:title>Example book</dc:title><dc:creator>Example author</dc:creator><dc:identifier>9780000000000</dc:identifier></dc:dc></recordData></record></records></searchRetrieveResponse>"""
class PilotTests(unittest.TestCase):
    def test_candidate_only(self):
        result = parse(FIXTURE)
        self.assertTrue(result["partial"])
        self.assertEqual(result["records"][0]["status"], "human_review_required")
        self.assertEqual(result["records"][0]["bnf_arks"], ["ark:/12148/cb123456789"])
    def test_name_query(self):
        url = request_url(name="Dylan Heskin")
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["query"], ['bib.anywhere all "Dylan Heskin"'])
    def test_authority_query(self):
        self.assertIn("bib.author2bib", request_url(authority="13935859"))
        with self.assertRaises(ValueError): request_url(authority="bad")
    def test_refuse_injection(self):
        with self.assertRaises(ValueError): request_url(name='foo" or bib.anywhere all "bar')
    def test_error_is_not_empty(self):
        with self.assertRaises(ValueError): parse(b"<html/>")
        with self.assertRaises(ValueError): parse(b'<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><numberOfRecords>0</numberOfRecords><diagnostics/></searchRetrieveResponse>')
if __name__ == "__main__": unittest.main()
