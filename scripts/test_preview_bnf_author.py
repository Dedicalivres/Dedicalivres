import unittest
import datetime
import tempfile
import urllib.parse
from preview_bnf_author import request_url, parse, save_snapshot, read_snapshot, snapshot_path
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
        for invalid in ("bad", "1234567", "123456789", "1234567890"):
            with self.assertRaises(ValueError): request_url(authority=invalid)
    def test_pagination_bounds(self):
        url = request_url(authority="11918746", start=21)
        params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        self.assertEqual(params["startRecord"], ["21"])
        self.assertEqual(params["maximumRecords"], ["20"])
        for invalid in (0, -1, 100001, True, "21"):
            with self.assertRaises(ValueError): request_url(authority="11918746", start=invalid)
    def test_last_page_and_next_offset(self):
        first = parse(FIXTURE)
        self.assertTrue(first["has_more"])
        self.assertEqual(first["next_start_record"], 2)
        last = parse(FIXTURE, start=21)
        self.assertTrue(last["partial"])
        self.assertFalse(last["has_more"])
        self.assertIsNone(last["next_start_record"])
        with self.assertRaises(ValueError): parse(FIXTURE, start=22)
        empty = b'<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><numberOfRecords>21</numberOfRecords></searchRetrieveResponse>'
        self.assertFalse(parse(empty, start=22)["has_more"])
        with self.assertRaises(ValueError): parse(empty, start=21)
    def test_refuse_injection(self):
        with self.assertRaises(ValueError): request_url(name='foo" or bib.anywhere all "bar')
    def test_error_is_not_empty(self):
        with self.assertRaises(ValueError): parse(b"<html/>")
        with self.assertRaises(ValueError): parse(b'<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><numberOfRecords>0</numberOfRecords><diagnostics/></searchRetrieveResponse>')
    def test_candidate_snapshot(self):
        utc = datetime.timezone.utc
        stamp = datetime.datetime(2026, 11, 26, tzinfo=utc)
        url = request_url(name="Example author")
        result = {"query_url": url, "retrieved_at": stamp.isoformat(),
                  "publication_allowed": False, **parse(FIXTURE)}
        with tempfile.TemporaryDirectory() as directory:
            save_snapshot(directory, result)
            fresh = read_snapshot(directory, url, stamp + datetime.timedelta(days=1))
            self.assertFalse(fresh["cache_stale"])
            self.assertEqual(fresh["cache_age_seconds"], 86400)
            self.assertFalse(fresh["publication_allowed"])
            stale = read_snapshot(directory, url, stamp + datetime.timedelta(days=7))
            self.assertTrue(stale["cache_stale"])
            self.assertEqual(stale["records"][0]["status"], "human_review_required")
            with self.assertRaises(FileNotFoundError):
                read_snapshot(directory, request_url(name="Example author", start=21), stamp)
            with self.assertRaises(ValueError):
                read_snapshot(directory, url, stamp - datetime.timedelta(seconds=1))
            save_snapshot(directory, {**result, "publication_allowed": True})
            with self.assertRaises(ValueError):
                read_snapshot(directory, url, stamp)
            save_snapshot(directory, result)
            snapshot_path(directory, url).write_text("invalid JSON", encoding="utf-8")
            with self.assertRaises(ValueError):
                read_snapshot(directory, url, stamp)
if __name__ == "__main__": unittest.main()
