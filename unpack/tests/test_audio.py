from gfunpack import audio


def test_bgm():
    audio.BGM('downloader/output', 'audio').save()

if __name__ == '__main__':
    test_bgm()
