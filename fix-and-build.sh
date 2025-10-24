#!/bin/bash
set -e

echo "🔧 Fixing Cargo dependencies for Solana 1.18 compatibility..."
echo "=============================================================="

cd "$(dirname "$0")"

# Delete all lock files
find . -name "Cargo.lock" -delete
echo "✅ Deleted old Cargo.lock files"

# Downgrade dependencies to versions compatible with Rust 1.75
echo ""
echo "📦 Downgrading dependencies..."

for dir in programs/thought-epoch programs/gas-utils programs/lucid-passports; do
  echo "  Processing $dir..."
  
  cargo update --manifest-path $dir/Cargo.toml indexmap --precise 2.2.6
  cargo update --manifest-path $dir/Cargo.toml toml_edit --precise 0.22.6  
done

echo "✅ Dependencies downgraded"

# Now build
echo ""
echo "🔨 Building programs..."
PATH="/home/admin/solana-release/bin:$PATH" anchor build

echo ""
echo "✅ Build complete!"
echo ""
echo "Check for .so files:"
ls -lh target/deploy/*.so
