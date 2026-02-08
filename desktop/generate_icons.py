#!/usr/bin/env python3
"""
Generate macOS menu bar icons for the posture monitoring app.
Uses PIL to create clean, professional icons.
"""

from PIL import Image, ImageDraw
import os

# Create assets directory if it doesn't exist
ASSETS_DIR = os.path.join(os.path.dirname(__file__), 'assets')
os.makedirs(ASSETS_DIR, exist_ok=True)

def create_template_icon(size):
    """
    Create a template icon (black on transparent) for macOS menu bar.
    macOS will automatically invert this for light/dark mode.
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Scale dimensions based on size
    scale = size / 22.0

    # Draw head (circle at top)
    head_radius = int(3 * scale)
    head_center_x = size // 2
    head_center_y = int(5 * scale)
    draw.ellipse(
        [head_center_x - head_radius, head_center_y - head_radius,
         head_center_x + head_radius, head_center_y + head_radius],
        fill=(0, 0, 0, 255)
    )

    # Draw spine (vertical line)
    spine_width = int(2 * scale)
    spine_left = head_center_x - spine_width // 2
    spine_top = head_center_y + head_radius
    spine_bottom = int(19 * scale)
    draw.rectangle(
        [spine_left, spine_top, spine_left + spine_width, spine_bottom],
        fill=(0, 0, 0, 255)
    )

    return img

def create_colored_circle(size, color_hex):
    """
    Create a colored circle icon for state indication.
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Parse hex color
    color_hex = color_hex.lstrip('#')
    r, g, b = tuple(int(color_hex[i:i+2], 16) for i in (0, 2, 4))

    # Draw circle with slight transparency for a softer look
    radius = int(size * 0.35)  # Use 35% of size for the circle
    center = size // 2
    draw.ellipse(
        [center - radius, center - radius,
         center + radius, center + radius],
        fill=(r, g, b, 230)  # Slight transparency
    )

    return img

def main():
    print("Generating macOS menu bar icons...")

    # Generate template icons (for the main menu bar icon)
    print("Creating template icons...")
    template_1x = create_template_icon(22)
    template_2x = create_template_icon(44)

    template_1x.save(os.path.join(ASSETS_DIR, 'iconTemplate.png'))
    template_2x.save(os.path.join(ASSETS_DIR, 'iconTemplate@2x.png'))
    print(f"  ✓ iconTemplate.png (22x22)")
    print(f"  ✓ iconTemplate@2x.png (44x44)")

    # Generate colored state icons
    print("\nCreating colored state icons...")

    colors = {
        'green': '#10b981',   # Good posture
        'yellow': '#f59e0b',  # Warning
        'red': '#ef4444'      # Slouching
    }

    for color_name, color_hex in colors.items():
        icon_1x = create_colored_circle(22, color_hex)
        icon_2x = create_colored_circle(44, color_hex)

        icon_1x.save(os.path.join(ASSETS_DIR, f'icon-{color_name}.png'))
        icon_2x.save(os.path.join(ASSETS_DIR, f'icon-{color_name}@2x.png'))
        print(f"  ✓ icon-{color_name}.png (22x22)")
        print(f"  ✓ icon-{color_name}@2x.png (44x44)")

    print("\n✅ All icons generated successfully!")

if __name__ == '__main__':
    main()
