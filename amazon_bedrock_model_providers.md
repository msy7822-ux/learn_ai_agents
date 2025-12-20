# Amazon Bedrockで利用可能なモデルプロバイダー

## 概要

Amazon Bedrockは、AWSが提供するフルマネージドサービスで、複数の主要AIプロバイダーから高性能な基盤モデル（Foundation Models: FMs）にアクセスできるプラットフォームです。

## 主要モデルプロバイダー一覧

| プロバイダー | 代表的なモデル | 用途 |
|------------|--------------|-----|
| **Amazon** | Titan | テキスト生成、埋め込み（Embeddings）、画像生成 |
| **Anthropic** | Claude | テキスト生成、チャット、コーディング、推論 |
| **AI21 Labs** | Jurassic | テキスト生成、要約 |
| **Cohere** | Command, Embed | テキスト生成、埋め込み（Embeddings） |
| **Meta** | Llama 2, Llama 3 | テキスト生成、チャット |
| **Mistral AI** | Mistral Large, Ministral | テキスト生成、コーディング、マルチモーダル |
| **Stability AI** | Stable Diffusion | 画像生成 |

## Amazon Bedrock Marketplace

Amazon Bedrock Marketplaceを通じて、追加で100以上の基盤モデルにアクセスできます。以下のプロバイダーのモデルも利用可能です：

- **IBM** - Graniteモデル
- **NVIDIA**
- **Google**
- **OpenAI** - GPT OSSモデル
- **MiniMax AI**
- **Moonshot AI**
- **Qwen**
- **Upstages**
- **Evolutionary Scale**
- **Arcee AI**
- **Widn.AI**

## モデルの特徴と対応タスク

### テキスト生成・チャット
- Amazon Titan
- Anthropic Claude
- AI21 Labs Jurassic
- Cohere Command
- Meta Llama
- Mistral AI

### 画像生成
- Stability AI Stable Diffusion
- Amazon Titan Image Generator

### 埋め込み（Embeddings）
- Amazon Titan Embeddings
- Cohere Embed

### マルチモーダル（テキスト + ビジョン）
- Anthropic Claude（ビジョン対応バージョン）
- Mistral Large 3

## 利用方法

1. **モデルカタログから選択**: Amazon Bedrockコンソールのモデルカタログからモデルを選択
2. **プレイグラウンドでテスト**: テキスト、チャット、画像の各プレイグラウンドで実験
3. **APIでの利用**: AWS SDKまたはConverse APIを通じて統一的にモデルを呼び出し

## 主な機能

- **モデル評価（Model Evaluation）**: 自動評価と人間による評価でユースケースに最適なモデルを選定
- **カスタマイズ**: ファインチューニングや継続事前学習によるモデルのカスタマイズ
- **Converse API**: モデル間の差異を吸収し、統一的なAPIでモデルを呼び出し可能
- **モデル蒸留（Model Distillation）**: 大きなモデルから小さく効率的なモデルを作成

## 対応リージョン

Amazon Bedrock Marketplaceは以下のリージョンで利用可能：

- US East (N. Virginia)
- US East (Ohio)
- US West (Oregon)
- Asia Pacific (Mumbai, Seoul, Singapore, Sydney, Tokyo)
- Canada (Central)
- Europe (Frankfurt, Ireland, London, Paris)
- South America (São Paulo)

## 参考リンク

- [Amazon Bedrock 公式ドキュメント](https://docs.aws.amazon.com/bedrock/latest/userguide/)
- [サポートされている基盤モデル](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html)
- [Amazon Bedrock Marketplace](https://docs.aws.amazon.com/bedrock/latest/userguide/amazon-bedrock-marketplace.html)

---
*出典: AWS公式ドキュメント*
