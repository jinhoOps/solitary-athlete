from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode


def dashboard_link(base, code):
    if not base or not code or not code.strip():
        return ''
    url = urlsplit(base)
    if url.scheme not in ('https', 'http') or not url.netloc:
        raise ValueError('Invalid dashboard URL')
    query = [(key, value) for key, value in parse_qsl(url.query, keep_blank_values=True) if key != 'code']
    query.append(('code', code.strip()))
    return urlunsplit((url.scheme, url.netloc, url.path, urlencode(query), url.fragment))
