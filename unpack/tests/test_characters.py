from gfunpack import characters, mapper, prefabs


def test_characters():
    sprite_indices = prefabs.Prefabs('downloader/output')
    collection = characters.CharacterCollection(
        'downloader/output', 'images',
        sprite_indices, pngquant=True,
    )
    collection.extract()
    mapper.Mapper(sprite_indices, collection).write_indices()


if __name__ == '__main__':
    test_characters()
