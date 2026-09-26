from src.hearsay.data import ManifestDataset


class HearsayTrainDataset(ManifestDataset):
    def __init__(self, manifest):
        super().__init__(manifest, 64600, training=True)


class HearsayEvalDataset(ManifestDataset):
    def __init__(self, manifest, labeled=True):
        super().__init__(manifest, 64600, labeled=labeled)
