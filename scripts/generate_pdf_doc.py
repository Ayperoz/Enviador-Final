from pathlib import Path

SOURCE = Path('docs/DOCUMENTACION_APP.md')
TARGET = Path('docs/DOCUMENTACION_APP.pdf')


def escape_pdf_text(text: str) -> str:
    return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def build_pdf_from_lines(lines):
    page_width = 595
    page_height = 842
    margin_x = 50
    margin_top = 70
    line_height = 14
    font_size = 11

    max_lines_per_page = int((page_height - margin_top - 60) / line_height)

    pages = []
    current = []

    for raw_line in lines:
        line = raw_line.rstrip('\n')
        if not line:
            wrapped = ['']
        else:
            wrapped = []
            while len(line) > 95:
                cut = line[:95]
                split_at = cut.rfind(' ')
                if split_at <= 0:
                    split_at = 95
                wrapped.append(line[:split_at])
                line = line[split_at:].lstrip()
            wrapped.append(line)

        for w in wrapped:
            if len(current) >= max_lines_per_page:
                pages.append(current)
                current = []
            current.append(w)

    if current:
        pages.append(current)

    objects = []

    # 1: catalog, 2: pages
    objects.append('<< /Type /Catalog /Pages 2 0 R >>')

    kids = [f'{4 + i * 2} 0 R' for i in range(len(pages))]
    objects.append(f"<< /Type /Pages /Count {len(pages)} /Kids [{' '.join(kids)}] >>")

    # 3: font
    objects.append('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

    for i, page_lines in enumerate(pages):
        page_obj_num = 4 + i * 2
        content_obj_num = 5 + i * 2

        content_lines = ['BT', f'/F1 {font_size} Tf', f'{margin_x} {page_height - margin_top} Td']
        first = True
        for text in page_lines:
            if not first:
                content_lines.append(f'0 -{line_height} Td')
            first = False
            content_lines.append(f'({escape_pdf_text(text)}) Tj')
        content_lines.append('ET')

        content_stream = '\n'.join(content_lines).encode('latin-1', errors='replace')

        page_obj = (
            f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] '
            f'/Resources << /Font << /F1 3 0 R >> >> /Contents {content_obj_num} 0 R >>'
        )
        content_obj = f'<< /Length {len(content_stream)} >>\nstream\n'.encode('ascii') + content_stream + b'\nendstream'

        objects.append(page_obj)
        objects.append(content_obj)

    pdf = bytearray(b'%PDF-1.4\n')
    offsets = [0]

    for idx, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f'{idx} 0 obj\n'.encode('ascii'))
        if isinstance(obj, bytes):
            pdf.extend(obj)
            pdf.extend(b'\n')
        else:
            pdf.extend(obj.encode('latin-1', errors='replace'))
            pdf.extend(b'\n')
        pdf.extend(b'endobj\n')

    xref_pos = len(pdf)
    pdf.extend(f'xref\n0 {len(objects) + 1}\n'.encode('ascii'))
    pdf.extend(b'0000000000 65535 f \n')

    for off in offsets[1:]:
        pdf.extend(f'{off:010d} 00000 n \n'.encode('ascii'))

    pdf.extend(
        f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n'.encode(
            'ascii'
        )
    )

    return pdf


def main():
    lines = SOURCE.read_text(encoding='utf-8').splitlines()
    pdf_bytes = build_pdf_from_lines(lines)
    TARGET.write_bytes(pdf_bytes)
    print(f'PDF generado en: {TARGET}')


if __name__ == '__main__':
    main()
