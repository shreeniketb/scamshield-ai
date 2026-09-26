from src.hearsay.data import ManifestDataset


class HearsayTrainDataset(ManifestDataset):
    def __init__(self, manifest):
        super().__init__(manifest, 64000, training=True)


class HearsayEvalDataset(ManifestDataset):
    def __init__(self, manifest, labeled=True):
        super().__init__(manifest, 64000, labeled=labeled)
